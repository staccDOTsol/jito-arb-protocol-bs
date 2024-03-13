const { calculateProfit, toDecimal, storeItInTempAsJSON } = require("../utils");
const cache = require("./cache");
const { setTimeout } = require("timers/promises");
const { balanceCheck } = require("./setup");
const { checktrans } = require("../utils/transaction.js");
const promiseRetry = require("promise-retry");
const { Keypair, TransactionMessage, Connection, PublicKey, AddressLookupTableAccount, VersionedTransaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");
const { bs58 } = require("@coral-xyz/anchor/dist/cjs/utils/bytes/index.js");
const { Bundle } = require( 'jito-ts/dist/sdk/block-engine/types.js' );
const {SPL_MINT_LAYOUT} = require('@raydium-io/raydium-sdk')
const {createTransferCheckedInstruction,getAssociatedTokenAddressSync } = require('@solana/spl-token')
const waitabit = async (ms) => {
	const mySecondPromise = new Promise(function(resolve,reject){
		console.log('construct a promise...')
		setTimeout(() => {
			reject(console.log('Error in promise'));
		},ms)
	})
  }
  const bundlesInTransit = new Map();
  async function processCompletedTrade(uuid) {
	const trade = bundlesInTransit.get(uuid);
  
	const txn0Signature = bs58.encode(trade.bundle[0].signatures[0]);
  
	const txn2 = await connection
	  .getTransaction(txn0Signature, {
		commitment: 'confirmed',
		maxSupportedTransactionVersion: 10,
	  })
	  .catch(() => {
		console.log(
		  `getTransaction failed. Assuming txn2 ${txn0Signature} did not land`,
		);
		return null;
	  });
  
	if (txn2 !== null) {
	  trade.landed = true;
	}
	console.log('Bundle landed:', trade.landed);

}

const TIP_ACCOUNTS = [
	'96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
	'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
	'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
	'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
	'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
	'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
	'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
	'3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  ].map((pubkey) => new PublicKey(pubkey));
  
  const getRandomTipAccount = () =>
	TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];
  
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY));
const connection = new Connection(process.env.DEFAULT_RPC);

const deserializeInstruction = (instruction) => {
	return new TransactionInstruction({
	programId: new PublicKey(instruction.programId),
	keys: instruction.accounts.map((key) => ({
		pubkey: new PublicKey(key.pubkey),
		isSigner: key.isSigner,
		isWritable: key.isWritable,
	})),
	data: Buffer.from(instruction.data, "base64"),
	});
};

const getAddressLookupTableAccounts = async (
	keys
) => {
	const addressLookupTableAccountInfos =
	await connection.getMultipleAccountsInfo(
		keys.map((key) => new PublicKey(key))
	);

	return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
	const addressLookupTableAddress = keys[index];
	if (accountInfo) {
		const addressLookupTableAccount = new AddressLookupTableAccount({
		key: new PublicKey(addressLookupTableAddress),
		state: AddressLookupTableAccount.deserialize(accountInfo.data),
		});
		acc.push(addressLookupTableAccount);
	}

	return acc;
	}, new Array());
};
const swap = async (jupiter, tokenIn, route, routeB, client, marginfiAccount, jito, amountIn) => {
	try {
		const performanceOfTxStart = performance.now();
		cache.performanceOfTxStart = performanceOfTxStart;

		if (process.env.DEBUG) storeItInTempAsJSON("routeInfoBeforeSwap", route);

		  // pull the trade priority
		  const priority = typeof cache.config.priority === "number" ? cache.config.priority : 100; //100 BPS default if not set
		  cache.priority = priority;

		const swap1 = await jupiter.swapInstructionsPost({
			swapRequest: {
				quoteResponse: route,
				userPublicKey: wallet.publicKey.toBase58(),
				dynamicComputeUnitLimit: true,
				prioritizationFeeLamports: "auto"
			  }		  
		})
		

		var {
			tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
			computeBudgetInstructions, // The necessary instructions to setup the compute budget.
			setupInstructions, // Setup missing ATA for the users.
			swapInstruction: swapInstructionPayload, // The actual swap instruction.
			cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
			addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
		} = swap1;
		
		
		var addressLookupTableAccounts = [];
		
		addressLookupTableAccounts.push(
			...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
		);
		
		var blockhash = (await connection.getLatestBlockhash()).blockhash;
		var instructions = []
		var cus = []
		var sus = []
		if (setupInstructions != undefined && setupInstructions.length > 0) {
			sus.push(...setupInstructions.map(deserializeInstruction));
		}
		instructions.push (deserializeInstruction(swapInstructionPayload));
		if (cleanupInstruction != undefined) {
			cus.push(deserializeInstruction(cleanupInstruction));
		}
		const swap2 = await jupiter.swapInstructionsPost({
			swapRequest: {
				quoteResponse: routeB,
				userPublicKey: wallet.publicKey.toBase58(),
				dynamicComputeUnitLimit: true,
				prioritizationFeeLamports: "auto"
			  }		  
		})
		

		var {
			setupInstructions: setup2, // Setup missing ATA for the users.
			swapInstruction: swapInstructionPayload2, // The actual swap instruction.
			cleanupInstruction: cleanup2, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
			addressLookupTableAddresses: luts2, // The lookup table addresses that you can use if you are using versioned transaction.
		} = swap2;
		
		addressLookupTableAccounts.push(
			...(await getAddressLookupTableAccounts(luts2))
		);
		
		if (setup2 != undefined && setup2.length > 0) {
			sus.push(...setup2.map(deserializeInstruction));
		}
		const instructions2 = []
		instructions2.push (deserializeInstruction(swapInstructionPayload2));
		if (cleanup2 != undefined) {
			cus.push(deserializeInstruction(cleanup2));
		}
		const tipIxn = SystemProgram.transfer({
		  fromPubkey: wallet.publicKey,
		  toPubkey: getRandomTipAccount(),
		  lamports: BigInt("10000"),
		});
		cus.push(tipIxn);
		const mintAccountInfo = await connection.getAccountInfo(new PublicKey(tokenIn.address));
		const minty = SPL_MINT_LAYOUT.decode(mintAccountInfo.data);
	
		const ata =getAssociatedTokenAddressSync(new PublicKey(tokenIn.address), 
		wallet.publicKey,true,mintAccountInfo.owner)
		const verifyIxn = createTransferCheckedInstruction(
			/*
    source: PublicKey,
    mint: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: number | bigint,
    decimals: number,*/
ata,

new PublicKey(tokenIn.address),
ata,
 wallet.publicKey,
  (amountIn),
 minty.decimals
		);
		cus.push(verifyIxn);
		const messageMain = new TransactionMessage({
		  payerKey: wallet.publicKey,
		  recentBlockhash: blockhash,
		  instructions
		}).compileToV0Message(addressLookupTableAccounts);
		const mainTx = new VersionedTransaction(messageMain);
		const messageMain2 = new TransactionMessage({
		  payerKey: wallet.publicKey,
		  recentBlockhash: blockhash,
		  instructions: instructions2
		}).compileToV0Message(addressLookupTableAccounts);
		const mainTx2 = new VersionedTransaction(messageMain2);
		
		const messageSetup = new TransactionMessage({
			payerKey: wallet.publicKey,
			recentBlockhash: blockhash,
			instructions: sus
		  }).compileToV0Message(addressLookupTableAccounts);
		  const setupTx = new VersionedTransaction(messageSetup);
		  const messageCleanup = new TransactionMessage({
			payerKey: wallet.publicKey,
			recentBlockhash: blockhash,
			instructions: cus
		  }).compileToV0Message(addressLookupTableAccounts);
		  const cleanupTx = new VersionedTransaction(messageCleanup);
		setupTx.sign([wallet]);
		mainTx.sign([wallet]);
		mainTx2.sign([wallet]);
		cleanupTx.sign([wallet]);
		 const bundle = [setupTx, mainTx, mainTx2, cleanupTx]
		 const now = Date.now();
		 let uuid 
    jito
      .sendBundle(new Bundle(bundle, 5))
      .then((bundleId) => {
        console.log(
          `Bundle ${bundleId} sent, backrunning ${bs58.encode(
            bundle[0].signatures[0],
          )}`,
        );
		uuid = bundleId

        bundlesInTransit.set(bundleId, {
			bundle,
			accepted: 0,
			rejected: false,
			errorType: null,
			errorContent: null,
			landed: false
		  });
        setTimeout(() => {
          processCompletedTrade(bundleId);
        }, 30_000);
      })
      .catch((error) => {


        if (
          error?.message?.includes(
            'Bundle Dropped, no connected leader up soon',
          )
        ) {
          console.log(
            'Error sending bundle: Bundle Dropped, no connected leader up soon.',
          );
        } else {
			console.log(error, 'Error sending bundle');
        }
	})
		return 
	} catch (error) {
		console.log("Swap error: ", error);
	}
};
exports.swap = swap;

const failedSwapHandler = async(tradeEntry, inputToken, tradeAmount) => {
	// update trade counter
	cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].fail++;

	// Update trade history if configured
	if (cache.config.storeFailedTxInHistory) {
		cache.tradeHistory.push(tradeEntry);
	}

	// Double check the balance
	const realbalanceToken = await balanceCheck(inputToken);

	// If balance is insufficient, handle it
	if (Number(realbalanceToken) < Number(tradeAmount)) {
		cache.tradeCounter.failedbalancecheck++;

		if (cache.tradeCounter.failedbalancecheck > 5) {
			console.log(`Balance Lookup is too low for token: ${realbalanceToken} < ${tradeAmount}`);
			console.log(`Failed For: ${cache.tradeCounter.failedbalancecheck} times`);
			process.exit();
		}
	}

	// Increment error count and check if too high
	cache.tradeCounter.errorcount += 1;
	if (cache.tradeCounter.errorcount > 100) {
		console.log(`Error Count is too high for swaps: ${cache.tradeCounter.errorcount}`);
		console.log('Ending to stop endless transactions failing');
		process.exit();
	}

};
exports.failedSwapHandler = failedSwapHandler;

const successSwapHandler = async (tx, tradeEntry, tokenA, tokenB) => {
	if (process.env.DEBUG) storeItInTempAsJSON(`txResultFromSDK_${tx?.txid}`, tx);

		// update counter
		cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].success++;

		if (cache.config.tradingStrategy === "pingpong") {
			// update balance
			if (cache.sideBuy) {
				cache.lastBalance.tokenA = cache.currentBalance.tokenA;
				cache.currentBalance.tokenA = 0;
				cache.currentBalance.tokenB = tx.outputAmount;
			} else {
				cache.lastBalance.tokenB = cache.currentBalance.tokenB;
				cache.currentBalance.tokenB = 0;
				cache.currentBalance.tokenA = tx.outputAmount;
			}

			// update profit
			if (cache.sideBuy) {
				cache.currentProfit.tokenA = 0;
				cache.currentProfit.tokenB = calculateProfit(
					String(cache.initialBalance.tokenB),
					String(cache.currentBalance.tokenB)
				);
			} else {
				cache.currentProfit.tokenB = 0;
				cache.currentProfit.tokenA = calculateProfit(
					String(cache.initialBalance.tokenA),
					String(cache.currentBalance.tokenA)
				);
			}

			// update trade history
			let tempHistory = cache.tradeHistory;

			tradeEntry.inAmount = toDecimal(
				tx.inputAmount,
				cache.sideBuy ? tokenA.decimals : tokenB.decimals
			);
			tradeEntry.outAmount = toDecimal(
				tx.outputAmount,
				cache.sideBuy ? tokenB.decimals : tokenA.decimals
			);

			tradeEntry.profit = calculateProfit(
				String(cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"]),
				String(tx.outputAmount)
			);
			tempHistory.push(tradeEntry);
			cache.tradeHistory = tempHistory;

		}
		if (cache.config.tradingStrategy === "arbitrage") {
			/** check real amounts because Jupiter SDK returns wrong amounts
			 *  when trading ARB TokenA <> TokenA (arbitrage)
			 */

			try {
				// BETA LOOKUP FOR RESULT VIA RPC
				var txresult = [];
				var err2 = -1;
				var rcount = 0;
				var retries = 30;

				const fetcher = async (retry) => {

					console.log('Looking for ARB trade result via RPC.');
					rcount++;

					if (rcount>=retries){
						// Exit max retries
						console.log(`Reached max attempts to fetch transaction. Assuming it did not complete.`);
						return -1;
					}

					// Get the results of the transaction from the RPC
					// Sometimes this takes time for it to post so retry logic is implemented
					[txresult, err2] = await checktrans(tx?.txid,cache.walletpubkeyfull);
					
					if (err2==0 && txresult) {
						if (txresult?.[tokenA.address]?.change>0) {

							// update balance
							cache.lastBalance.tokenA = cache.currentBalance.tokenA;
							cache.currentBalance.tokenA = (cache.currentBalance.tokenA+txresult?.[tokenA.address]?.change);
						
							// update profit
							cache.currentProfit.tokenA = calculateProfit(
								String(cache.initialBalance.tokenA),
								String(cache.currentBalance.tokenA)
							);

							// update trade history
							let tempHistory = cache.tradeHistory;

							tradeEntry.inAmount = toDecimal(
								cache.lastBalance.tokenA, tokenA.decimals
							);
							tradeEntry.outAmount = toDecimal(
								cache.currentBalance.tokenA, tokenA.decimals
							);

							tradeEntry.profit = calculateProfit(
								String(cache.lastBalance.tokenA),
								String(cache.currentBalance.tokenA)
							);
							tempHistory.push(tradeEntry);
							cache.tradeHistory = tempHistory;

						    //console.log(`Tx result with output token, returning..`);
							return txresult;
						} else {
							retry(new Error("Transaction was not posted yet... Retrying..."));
						}
					} else if(err2==2){
						// Transaction failed. Kill it and retry
						err.message = JSON.stringify(txresult);
						return -1;
					} else{
						retry(new Error("Transaction was not posted yet. Retrying..."));
					}
				};

				const lookresult = await promiseRetry(fetcher, {
						retries: retries,
						minTimeout: 1000,
						maxTimeout: 4000,
						randomize: true,
					});

				if (lookresult==-1){
					//console.log('Lookup Shows Failed Transaction.');
					outputamt = 0;
					err.status=true;
				} else {
					// Track the output amount
					inputamt = txresult[tokenA.address].start;
					outputamt = txresult[tokenA.address].end;

					cache.currentProfit.tokenA = calculateProfit(
							cache.initialBalance.tokenA,
							cache.currentBalance.tokenA
					);

					// update trade history
					let tempHistory = cache.tradeHistory;

					tradeEntry.inAmount = toDecimal(inputamt, tokenA.decimals);
					tradeEntry.outAmount = toDecimal(outputamt, tokenA.decimals);

					tradeEntry.profit = calculateProfit(tradeEntry.inAmount,tradeEntry.outAmount);
					tempHistory.push(tradeEntry);
					cache.tradeHistory = tempHistory;
				}

			} catch (error) {
					console.log("Fetch Result Error: ", error);  
			}
		}
};
exports.successSwapHandler = successSwapHandler;
