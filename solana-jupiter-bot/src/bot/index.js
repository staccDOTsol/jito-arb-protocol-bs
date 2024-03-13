console.clear();

require("dotenv").config();
const fs = require('fs')
const { clearInterval } = require("timers");
const { PublicKey, Connection } = require("@solana/web3.js");
const JSBI = require('jsbi');
const { setTimeout } = require("timers/promises");
const {
	calculateProfit,
	toDecimal,
	toNumber,
	updateIterationsPerMin,
	checkRoutesResponse,
	checkArbReady,
} = require("../utils");
const { handleExit, logExit } = require("./exit");
const cache = require("./cache");
const { setup, getInitialotherAmountThreshold, checkTokenABalance } = require("./setup");
const { printToConsole } = require("./ui/");
const { swap, failedSwapHandler, successSwapHandler } = require("./swap");
const { TOKEN_PROGRAM_ID } = require("@mrgnlabs/mrgn-common");

const connection = new Connection(process.env.DEFAULT_RPC);
const waitabit = async (ms) => {
	const mySecondPromise = new Promise(function(resolve,reject){
		console.log('construct a promise...')
		setTimeout(() => {
			reject(console.log('Error in promise'));
		},ms)
	})
}

function getRandomAmt(runtime) {
	const min = Math.ceil((runtime*10000)*0.99);
	const max = Math.floor((runtime*10000)*1.01);
	return ((Math.floor(Math.random() * (max - min + 1)) + min)/10000);
}

const pingpongStrategy = async (jupiter, tokenA, tokenB) => {
	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;

	try {
		// calculate & update iterations per minute
		updateIterationsPerMin(cache);

		// Calculate amount that will be used for trade
		const amountToTrade =
			cache.config.tradeSize.strategy === "cumulative"
				? cache.currentBalance[cache.sideBuy ? "tokenA" : "tokenB"]
				: cache.initialBalance[cache.sideBuy ? "tokenA" : "tokenB"];

		const baseAmount = cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"];
		const slippage = typeof cache.config.slippage === "number" ? cache.config.slippage : 1; // 1BPS is 0.01%

		// set input / output token
		const inputToken = cache.sideBuy ? tokenA : tokenB;
		const outputToken = cache.sideBuy ? tokenB : tokenA;
		const tokdecimals = cache.sideBuy ? inputToken.decimals : outputToken.decimals;
		const amountInJSBI = JSBI.BigInt(amountToTrade);

		// check current routes via JUP4 SDK
		const performanceOfRouteCompStart = performance.now();
		const routes = await jupiter.computeRoutes({
			inputMint: new PublicKey(inputToken.address),
			outputMint: new PublicKey(outputToken.address),
			amount: amountInJSBI,
			slippageBps: slippage,
			forceFetch: true,
			onlyDirectRoutes: false,
			filterTopNResult: 2,
		});

		checkRoutesResponse(routes);

		// count available routes
		cache.availableRoutes[cache.sideBuy ? "buy" : "sell"] =
			routes.routePlan.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp = performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = await routes.routePlan[0];

		// calculate profitability
		const simulatedProfit = calculateProfit(String(baseAmount), await (route.outAmount));

		// Alter slippage to be larger based on the profit if enabled in the config
		// set cache.config.adaptiveSlippage=1 to enable
		// Profit minus minimum profit
		// default to the set slippage
		var slippagerevised = slippage;

		if ((simulatedProfit > cache.config.minPercProfit) && cache.config.adaptiveSlippage == 1){
				var slippagerevised = (100*(simulatedProfit-cache.config.minPercProfit+(slippage/100))).toFixed(3)

				if (slippagerevised>500) {
					// Make sure on really big numbers it is only 30% of the total
					slippagerevised = (0.3*slippagerevised).toFixed(3);
				} else {
					slippagerevised = (0.8*slippagerevised).toFixed(3);
				}

				//console.log("Setting slippage to "+slippagerevised);
				route.slippageBps = slippagerevised;
		}

		// store max profit spotted
		if (
			simulatedProfit > cache.maxProfitSpotted[cache.sideBuy ? "buy" : "sell"]
		) {
			cache.maxProfitSpotted[cache.sideBuy ? "buy" : "sell"] = simulatedProfit;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB,
			route,
			simulatedProfit,
		});

		// check profitability and execute tx
		let tx, performanceOfTx;
		if (
			!cache.swappingRightNow &&
			(cache.hotkeys.e ||
				cache.hotkeys.r ||
				simulatedProfit >= cache.config.minPercProfit)
		) {
			// hotkeys
			if (cache.hotkeys.e) {
				console.log("[E] PRESSED - EXECUTION FORCED BY USER!");
				cache.hotkeys.e = false;
			}
			if (cache.hotkeys.r) {
				console.log("[R] PRESSED - REVERT BACK SWAP!");
				route.otherAmountThreshold = 0;
			}

			if (cache.tradingEnabled || cache.hotkeys.r) {
				cache.swappingRightNow = true;
				// store trade to the history
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: cache.sideBuy,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					inAmount: toDecimal(route.inAmount, inputToken.decimals),
					expectedOutAmount: toDecimal(route.outAmount, outputToken.decimals),
					expectedProfit: simulatedProfit,
					slippage: slippagerevised,
				};

				// start refreshing status
				const printTxStatus = setInterval(() => {
					if (cache.swappingRightNow) {
						printToConsole({
							date,
							i,
							performanceOfRouteComp,
							inputToken,
							outputToken,
							tokenA,
							tokenB,
							route,
							simulatedProfit,
						});
					}
				}, 50);

				[tx, performanceOfTx] = await swap(jupiter, route);

				// stop refreshing status
				clearInterval(printTxStatus);

				const profit = calculateProfit(
					cache.currentBalance[cache.sideBuy ? "tokenB" : "tokenA"],
					tx.outputAmount
				);

				tradeEntry = {
					...tradeEntry,
					outAmount: tx.outputAmount || 0,
					profit,
					performanceOfTx,
					error: tx.error?.code === 6001 ? "Slippage Tolerance Exceeded" : tx.error?.message || null,
				};

				var waittime = await waitabit(100);

				// handle TX results
				if (tx.error) {
					await failedSwapHandler(tradeEntry, inputToken, amountToTrade);
				}
				else {
					if (cache.hotkeys.r) {
						console.log("[R] - REVERT BACK SWAP - SUCCESS!");
						cache.tradingEnabled = false;
						console.log("TRADING DISABLED!");
						cache.hotkeys.r = false;
					}
					await successSwapHandler(tx, tradeEntry, tokenA, tokenB);
				}
			}
		}

		if (tx) {
			if (!tx.error) {
				// change side
				cache.sideBuy = !cache.sideBuy;
			}
			cache.swappingRightNow = false;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB,
			route,
			simulatedProfit,
		});

	} catch (error) {
		cache.queue[i] = 1;
		console.log(error);
	} finally {
		delete cache.queue[i];
	}
};

const arbitrageStrategy = async (jupiter, tokenA, tokenB, client, marginfiAccount, jito) => {

	//console.log('ARB STRAT ACTIVE');

	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;
	swapactionrun: try {
		// calculate & update iterations per minute
		updateIterationsPerMin(cache);

		// Calculate amount that will be used for trade
		const amountToTrade =
			cache.config.tradeSize.strategy === "cumulative"
				? cache.currentBalance["tokenA"]
				: cache.initialBalance["tokenA"];
		const baseAmount = amountToTrade;
        //BNI AMT to TRADE
        const amountInJSBI = tokenA.amount
        console.log('Amount to trade:'+amountInJSBI);

		// default slippage
		const slippage = typeof cache.config.slippage === "number" ? cache.config.slippage : 1; // 100 is 0.1%

		// set input / output token
		const inputToken = tokenA;
		
		const outputToken = tokenB;

		// check current routes
		const performanceOfRouteCompStart = performance.now();
		
		const routes = await jupiter.quoteGet({
			inputMint: inputToken.address,
			outputMint: outputToken.address,
			amount: (amountInJSBI).toString(),
			maxAccounts: 64
		});
		//console.log('Routes Lookup Run for '+ inputToken.address);
		checkRoutesResponse(routes);

		const routesB = await jupiter.quoteGet({
			outputMint: inputToken.address,
			inputMint: outputToken.address,
			amount: routes.outAmount.toString(),
			maxAccounts: 64
		});
		//console.log('Routes Lookup Run for '+ inputToken.address);
		checkRoutesResponse(routesB);


		// count available routes
		cache.availableRoutes[cache.sideBuy ? "buy" : "sell"] =
			routes.routePlan.length + routesB.routePlan.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp = performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = await routes;

		const routeB = await routesB;
		// calculate profitability
		const simulatedProfit = calculateProfit(baseAmount, await (routesB.outAmount));
		const minPercProfitRnd = getRandomAmt(cache.config.minPercProfit);
		//console.log('mpp:'+minPercProfitRnd);

		var slippagerevised = slippage;

		if ((simulatedProfit > cache.config.minPercProfit) && cache.config.adaptiveSlippage === 1){
				slippagerevised = (100*(simulatedProfit-minPercProfitRnd+(slippage/100))).toFixed(3)

				// Set adaptive slippage
				if (slippagerevised>500) {
						// Make sure on really big numbers it is only 30% of the total if > 50%
						slippagerevised = (0.30*slippagerevised).toFixed(3);
				} else {
						slippagerevised = (0.80*slippagerevised).toFixed(3);
				}
				//console.log("Setting slippage to "+slippagerevised);
				route.slippageBps = slippagerevised;
		}

		// store max profit spotted
		if (simulatedProfit > cache.maxProfitSpotted["buy"]) {
			cache.maxProfitSpotted["buy"] = simulatedProfit;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB: tokenA,
			route,
			simulatedProfit,
		});

		// check profitability and execute tx
		let tx, performanceOfTx;
		if (
			!cache.swappingRightNow &&
			(cache.hotkeys.e ||
				cache.hotkeys.r ||
				simulatedProfit >= minPercProfitRnd)
		) {
			// hotkeys
			if (cache.hotkeys.e) {
				console.log("[E] PRESSED - EXECUTION FORCED BY USER!");
				cache.hotkeys.e = false;
			}
			if (cache.hotkeys.r) {
				console.log("[R] PRESSED - REVERT BACK SWAP!");
				route.otherAmountThreshold = 0;
			}

			if (cache.tradingEnabled || cache.hotkeys.r) {
				/*cache.swappingRightNow = true;
				// store trade to the history
				console.log('swappingRightNow');
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: cache.sideBuy,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					inAmount: toDecimal(route.inAmount, inputToken.decimals),
					expectedOutAmount: toDecimal(route.outAmount, outputToken.decimals),
					expectedProfit: simulatedProfit,
				};

				// start refreshing status
				const printTxStatus = setInterval(() => {
					if (cache.swappingRightNow) {
						printToConsole({
							date,
							i,
							performanceOfRouteComp,
							inputToken,
							outputToken,
							tokenA,
							tokenB: tokenA,
							route,
							simulatedProfit,
						});
					}
				}, 250);
*/
				 swap(jupiter, tokenA, route, routeB, client, marginfiAccount, jito, amountInJSBI);
				/*tx = {
					outputAmount: routeB.outAmount,
					error: null,
					txid: tx,
					inputAmount: route.inAmount,
				}
				// stop refreshing status
				clearInterval(printTxStatus);

				// Calculate the profit of the trade
				const profit = calculateProfit(tradeEntry.inAmount, tx.outputAmount);

				tradeEntry = {
					...tradeEntry,
					outAmount: tx.outputAmount || 0,
					profit,
					performanceOfTx,
					error: tx.error?.code === 6001 ? "Slippage Tolerance Exceeded" : tx.error?.message || null,
					slippage: slippagerevised,
				};

				// handle TX results
				if (tx.error) {
					// Slippage tolerance exceeded
					await failedSwapHandler(tradeEntry, inputToken, amountToTrade);
				} else {
					if (cache.hotkeys.r) {
						console.log("[R] - REVERT BACK SWAP - SUCCESS!");
						cache.tradingEnabled = false;
						console.log("TRADING DISABLED!");
						cache.hotkeys.r = false;
					}
					await successSwapHandler(tx, tradeEntry, tokenA, tokenA);
				}*/
			}
		}

		if (tx) {
			cache.swappingRightNow = false;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB: tokenA,
			route,
			simulatedProfit,
		});
	} catch (error) {
		cache.queue[i] = 1;
	} finally {
		delete cache.queue[i];
	}
};

const watcher = async (jupiter, tokenA, tokens, client, marginfiAccount, jito, mytokens, myamounts) => {
	if (
		!cache.swappingRightNow &&
		Object.keys(cache.queue).length < cache.queueThrottle
	) {
		if (cache.config.tradingStrategy === "pingpong") {
			await pingpongStrategy(jupiter, tokenA, tokenB);
		}
		if (cache.config.tradingStrategy === "arbitrage") {

			const stokens = JSON.parse(fs.readFileSync("./temp/tokens.json"));
			let tokenB = undefined 
			while (tokenB == undefined){
				tokenB = stokens.find((t) => t.address === tokens[Math.floor(Math.random() * tokens.length)]);
			}
			tokenA = undefined 
			let rand 
			while (tokenA == undefined){
				 rand = Math.floor(Math.random() * mytokens.length)
				tokenA = stokens.find((t) => t.address === mytokens[rand]);

			}

			tokenA.amount = Number(myamounts[rand])
			console.log(tokenA)
			await arbitrageStrategy(jupiter, tokenA, tokenB, client, marginfiAccount, jito);
		}
	}
};

const run = async () => {
	try {
		// Are they ARB ready and part of the community?
		await checkArbReady();

		// set everything up
        const { jupiter, tokenA, tokenB, wallet, client, marginfiAccount, jito } = await setup();

		// Set pubkey display
		const walpubkeyfull = wallet.publicKey.toString();
		console.log(`Wallet Enabled: ${walpubkeyfull}`);
		cache.walletpubkeyfull = walpubkeyfull;
		cache.walletpubkey = walpubkeyfull.slice(0,5) + '...' + walpubkeyfull.slice(walpubkeyfull.length-3);
		//console.log(cache.walletpubkey);

		if (cache.config.tradingStrategy === "pingpong") {
			// set initial & current & last balance for tokenA
			console.log('Trade Size is:'+cache.config.tradeSize.value);

			cache.initialBalance.tokenA = toNumber(
				cache.config.tradeSize.value,
				tokenA.decimals
			);
			cache.currentBalance.tokenA = cache.initialBalance.tokenA;
			cache.lastBalance.tokenA = cache.initialBalance.tokenA;

			// Double check the wallet has sufficient amount of tokenA
			var realbalanceTokenA = await checkTokenABalance(tokenA,cache.initialBalance.tokenA);

			// set initial & last balance for tokenB
			cache.initialBalance.tokenB = await getInitialotherAmountThreshold(
				jupiter,
				tokenA,
				tokenB,
				cache.initialBalance.tokenA
			);
			cache.lastBalance.tokenB = cache.initialBalance.tokenB;
		} else if (cache.config.tradingStrategy === "arbitrage") {
			// set initial & current & last balance for tokenA
			//console.log('Trade Size is:'+cache.config.tradeSize.value+' decimals:'+tokenA.decimals);

			cache.initialBalance.tokenA = toNumber(
				cache.config.tradeSize.value,
				tokenA.decimals
			);

			cache.currentBalance.tokenA = cache.initialBalance.tokenA;
			cache.lastBalance.tokenA = cache.initialBalance.tokenA;

			// Double check the wallet has sufficient amount of tokenA
			var realbalanceTokenA = await checkTokenABalance(tokenA,cache.initialBalance.tokenA);

			if (realbalanceTokenA<cache.initialBalance.tokenA){
				console.log('Balance Lookup is too low for token: '+realbalanceTokenA+' < '+cache.initialBalance.tokenA);
				process.exit();
			}
		}
		const topTokens = (await (
			await fetch("https://cache.jup.ag/top-tokens")
		  ).json()) ;

			const myTokens = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {programId: TOKEN_PROGRAM_ID});
			const my2022Tokens = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')});
			const mytokens = myTokens.value.concat(my2022Tokens.value)
			.filter((t) => {
				// filter 0 and 1 balances
				return t.account.data.parsed.info.tokenAmount.amount > 1
			}
			)
			.map((t) => {
				return  t.account.data.parsed.info.mint
			})
			const myamounts = myTokens.value.concat(my2022Tokens.value)
			.filter((t) => {
				// filter 0 and 1 balances
				return t.account.data.parsed.info.tokenAmount.amount > 1
			}
			)
			.map((t) => {
				return  t.account.data.parsed.info.tokenAmount.amount
			})
			
			console.log('i have tokens:', mytokens);

		global.botInterval = setInterval(
			() => watcher(jupiter, tokenA, topTokens, client, marginfiAccount, jito, mytokens, myamounts),
			cache.config.minInterval
		);
	} catch (error) {
		logExit(error);
		process.exitCode = 1;
	}
};

run();

// handle exit
process.on("exit", handleExit);
