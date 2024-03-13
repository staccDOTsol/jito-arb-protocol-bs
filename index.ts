import fs from 'fs';
import fetch from 'node-fetch';

import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';

import {
  getConfig,
  MarginfiAccountWrapper,
  MarginfiClient,
} from './mrgn-ts';

const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('../7i.json').toString())));

export async function getMarginfiClient({
    readonly,
    authority,
    connection,
    wallet
}: {
    readonly?: boolean;
    authority?: PublicKey;
    connection?: Connection;
    wallet?: anchor.Wallet;
} = {}): Promise<MarginfiClient> {

    const config = getConfig("production");

    if (authority && !readonly) {
        console.log("Cannot only specify authority when readonly");
    }

    const client = await MarginfiClient.fetch(
        config,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallet as anchor.Wallet,
        connection as Connection,
        undefined,
        readonly
    );

    return client;
}

function deserializeIx(swapInstruction: any) {

    return new TransactionInstruction({
        programId: new PublicKey(swapInstruction.programId),
        keys: swapInstruction.accounts.map((key: any) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: Buffer.from(swapInstruction.data, "base64"),
    })
}

export async function parsePoolInfo() {
    const connection = new Connection(process.env.rpc as string, "confirmed");
    // example to get pool info
    const addresses = (await (await fetch("https://storage.googleapis.com/mrgn-public/mrgn-token-metadata-cache.json")).json())
        .map((x: any) => x.address)

    const client = await getMarginfiClient({ readonly: false, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP"), connection, wallet: new anchor.Wallet(payer) })
    // client.ts     public wallet: Wallet,


    console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);


    const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);
    // shuffle addresses
    addresses.sort(() => Math.random() - 0.5);
    for (const address of addresses) {
        const solBank = client.getBankByMint(new PublicKey(address));
        if (!solBank) throw Error("SOL bank not found");

        // await 5s delay 
        const override_banks = new Map()

        override_banks.set(solBank.address, solBank);

        const amount = (solBank.getTotalAssetQuantity().minus(solBank.getTotalLiabilityQuantity()).toNumber() * 0.9) / solBank.mintDecimals ** 10;

        const ixs: TransactionInstruction[] = [];
        /// await 1s delay
        console.log('trying ' + amount.toString())
        try {


            const borrowIx = await marginfiAccount.makeBorrowIx(amount, solBank.address)
            ixs.push(...borrowIx.instructions);
            const repayIx = await marginfiAccount.makeRepayIx(amount, solBank.address, true)
            ixs.push(...repayIx.instructions);

            let tx = await marginfiAccount.buildFlashLoanTx({ ixs })

            await client.processTransaction(tx, [], { skipPreflight: true });
            // sleep 2s
            await new Promise((resolve) => setTimeout(resolve, 666));
            console.log("done")
        } catch (err) {
            console.log(err)
        }
    }
}
async function main() {
    while (true) {
        await parsePoolInfo();
    }
}
main()