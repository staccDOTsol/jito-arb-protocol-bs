const fs = require("fs");
const chalk = require("chalk");
const ora = require("ora-classic");
const bs58 = require("bs58");
const { createJupiterApiClient } = require( '@jup-ag/api' );

const {
	SearcherClient,
	searcherClient 
  } = require( 'jito-ts/dist/sdk/block-engine/searcher.js')

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

var JSBI = (require('jsbi'));
var invariant = (require('tiny-invariant'));
var _Decimal = (require('decimal.js'));
var _Big = (require('big.js'));
var toFormat = (require('toformat'));
var anchor = require('@coral-xyz/anchor');

const { logExit } = require("./exit");
const { loadConfigFile, toDecimal } = require("../utils");
const { intro, listenHotkeys } = require("./ui");
const { setTimeout } = require("timers/promises");
const cache = require("./cache");
const { MarginfiClient, getConfig, MarginfiAccountWrapper } = require("../../../mrgn-ts/dist");
const wrapUnwrapSOL = cache.wrapUnwrapSOL;

// Account balance code
const balanceCheck = async (checkToken) => {
	let checkBalance = Number(0);
	let t = Number(0);

	const connection = new Connection(process.env.DEFAULT_RPC);
	wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY));

	if (wrapUnwrapSOL && checkToken.address === 'So11111111111111111111111111111111111111112') {
		// This is where Native balance is needing to be checked and not the Wrapped SOL ATA
		try {
			const balance = await connection.getBalance(wallet.publicKey);
			checkBalance = Number(balance);
		} catch (error) {
			console.error('Error fetching native SOL balance:', error);
		}
	} else {
		// Normal token so look up the ATA balance(s)
		try {
			let totalTokenBalance = BigInt(0);
			const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
				mint: new PublicKey(checkToken.address)
			});
		
			tokenAccounts.value.forEach((accountInfo) => {
				const parsedInfo = accountInfo.account.data.parsed.info;
				totalTokenBalance += BigInt(parsedInfo.tokenAmount.amount);
			});
		
			// Convert totalTokenBalance to a regular number
			checkBalance = Number(totalTokenBalance);
	
		} catch (error) {
			console.error('Error fetching token balance:', error);
		}
	}

	try {
		// Pass back the BN version to match
		let checkBalanceUi = toDecimal(checkBalance,checkToken.decimals);
		console.log(`Wallet balance for ${checkToken.symbol} is ${checkBalanceUi} (${checkBalance})`);
	} catch (error) {
		console.error('Silence is golden.. Or not...:', error);
	}

	if (checkBalance>Number(0)){
			return checkBalance;
	} else {
			return(Number(0));
	}
};

// Handle Balance Errors Messaging
const checkTokenABalance = async (tokenA, initialTradingBalance) => {
	try {
		// Check the balance of TokenA to make sure there is enough to trade with
		var realbalanceTokenA = await balanceCheck(tokenA);
		bal1 = toDecimal(realbalanceTokenA,tokenA.decimals);
		bal2 = toDecimal(initialTradingBalance,tokenA.decimals);

		if (realbalanceTokenA < initialTradingBalance) {
			throw new Error(`\x1b[93mThere is insufficient balance in your wallet of ${tokenA.symbol}\x1b[0m
			\nYou currently only have \x1b[93m${bal1}\x1b[0m ${tokenA.symbol}.
			\nTo run the bot you need \x1b[93m${bal2}\x1b[0m ${tokenA.symbol}.
			\nEither add more ${tokenA.symbol} to your wallet or lower the amount below ${bal1}.\n`);
		}
		return realbalanceTokenA;
	} catch (error) {
		// Handle errors gracefully
		console.error(`\n====================\n\n${error.message}\n====================\n`);
		// Return an appropriate error code or rethrow the error if necessary
		process.exit(1); // Exiting with a non-zero code to indicate failure
	}
}

 async function getMarginfiClient({
    readonly,
    authority,
    connection,
    wallet
}) {

    const config = getConfig("production");

    if (authority && !readonly) {
        console.log("Cannot only specify authority when readonly");
    }

    const client = await MarginfiClient.fetch(
        config,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallet ,
        connection ,
        undefined,
        readonly
    );

    return client;
}

const setup = async () => {
	let spinner, tokens, tokenA, tokenB, wallet;
	try {
		// listen for hotkeys
		listenHotkeys();
		await intro();

		// load config file and store it in cache
		cache.config = loadConfigFile({ showSpinner: false });

		spinner = ora({
			text: "Loading tokens...",
			discardStdin: false,
			color: "magenta",
		}).start();

		try {
			tokens = JSON.parse(fs.readFileSync("./temp/tokens.json"));
			tokenA = tokens.find((t) => t.address === cache.config.tokenA.address);

			if (cache.config.tradingStrategy !== "arbitrage")
				tokenB = tokens.find((t) => t.address === cache.config.tokenB.address);
		} catch (error) {
			spinner.text = chalk.black.bgRedBright(
				`\n	Loading tokens failed!\n	Please run the Wizard to generate it using ${chalk.bold(
					"`yarn start`"
				)}\n`
			);
			throw error;
		}

		try {
			spinner.text = "Checking wallet...";
			if (
				!process.env.SOLANA_WALLET_PRIVATE_KEY ||
				(process.env.SOLANA_WALLET_PUBLIC_KEY &&
					process.env.SOLANA_WALLET_PUBLIC_KEY?.length !== 88)
			) {
				throw new Error("Wallet check failed!");
			} else {
				wallet = Keypair.fromSecretKey(
					bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY)
				);
			}
		} catch (error) {
			spinner.text = chalk.black.bgRedBright(
				`\n	Wallet check failed! \n	Please make sure that ${chalk.bold(
					"SOLANA_WALLET_PRIVATE_KEY "
				)}\n	inside ${chalk.bold(".env")} file is correct \n`
			);
			logExit(1, error);
			process.exitCode = 1;
			throw error;
		}

		// Set up the RPC connection
		const connection = new Connection(cache.config.rpc[0]);

		spinner.text = "Loading the Jupiter V6 SDK and getting ready to trade...";

		const jupiter = createJupiterApiClient(); // config is optional
		const payer = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY))
		const arb = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('/home/ubuntu/arb.json').toString())))
		const jito = searcherClient("ny.mainnet.block-engine.jito.wtf", arb, {
			'grpc.keepalive_timeout_ms': 4000,
		  });
		
		const client = await getMarginfiClient({ readonly: false, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP"), connection, wallet: new anchor.Wallet(payer) })
		// client.ts     public wallet: Wallet,
	
	
		console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);
	
	
		const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);
		cache.isSetupDone = true;
		spinner.succeed("Checking to ensure you are ARB ready...\n====================\n");
		return { jupiter, tokenA, tokenB, wallet, client, marginfiAccount, jito };
	} catch (error) {
		if (spinner)
			spinner.fail(
				chalk.bold.redBright(`Setting up failed!\n 	${spinner.text}`)
			);
		logExit(1, error);
		process.exitCode = 1;
	}
};

const getInitialotherAmountThreshold = async (
	jupiter,
	inputToken,
	outputToken,
	amountToTrade
) => {
	let spinner;
	try {
		const tokenDecimals = cache.sideBuy ? inputToken.decimals : outputToken.decimals;
		const spinnerText = `Computing routes for the token with amountToTrade ${amountToTrade} with decimals ${tokenDecimals}`;

		spinner = ora({
			text: spinnerText,
			discardStdin: false,
			color: "magenta",
		}).start();

		//JSBI AMT to TRADE
		const amountInJSBI = JSBI.BigInt(amountToTrade);
		const routes = await jupiter.quoteGet({
			inputMint: inputToken.address,
			outputMint: outputToken.address,
			amount: amountInJSBI.toNumber()
		});
		console.log(routes)

		if (routes?.routesInfos?.length > 0) spinner.succeed("Routes computed!");
		else spinner.fail("No routes found. Something is wrong! Check tokens:"+inputToken.address+" "+outputToken.address);

		return routes.routesInfos[0].otherAmountThreshold;
	} catch (error) {
		if (spinner)
			spinner.fail(chalk.bold.redBright("Computing routes failed!\n"));
		logExit(1, error);
		process.exitCode = 1;
	}
};

module.exports = {
	setup,
	getInitialotherAmountThreshold,
	balanceCheck,
	checkTokenABalance,
};
