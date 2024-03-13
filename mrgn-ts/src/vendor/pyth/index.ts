import { readBigInt64LE, readBigUInt64LE } from "./readBig";
import { PublicKey } from "@solana/web3.js";

/** Number of slots that can pass before a publisher's price is no longer included in the aggregate. */
export const MAX_SLOT_DIFFERENCE = 25;
const empty32Buffer = Buffer.alloc(32);
const PKorNull = (data: Buffer) => (data.equals(empty32Buffer) ? null : new PublicKey(data));

export interface Price {
  priceComponent: bigint;
  price: number;
  confidenceComponent: bigint;
  confidence: number;
  status: PriceStatus;
  corporateAction: CorpAction;
  publishSlot: number;
}

export enum PriceStatus {
  Unknown,
  Trading,
  Halted,
  Auction,
  Ignored,
}

export enum CorpAction {
  NoCorpAct,
}

const parsePriceInfo = (data: Buffer, exponent: number): Price => {
  // aggregate price
  const priceComponent = readBigInt64LE(data, 0);
  const price = Number(priceComponent) * 10 ** exponent;
  // aggregate confidence
  const confidenceComponent = readBigUInt64LE(data, 8);
  const confidence = Number(confidenceComponent) * 10 ** exponent;
  // aggregate status
  const status: PriceStatus = data.readUInt32LE(16);
  // aggregate corporate action
  const corporateAction: CorpAction = data.readUInt32LE(20);
  // aggregate publish slot. It is converted to number to be consistent with Solana's library interface (Slot there is number)
  const publishSlot = Number(readBigUInt64LE(data, 24));
  return {
    priceComponent,
    price,
    confidenceComponent,
    confidence,
    status,
    corporateAction,
    publishSlot,
  };
};

export interface PriceData extends Base {
  priceType: PriceType;
  exponent: number;
  numComponentPrices: number;
  numQuoters: number;
  lastSlot: bigint;
  validSlot: bigint;
  emaPrice: Ema;
  emaConfidence: Ema;
  timestamp: bigint;
  minPublishers: number;
  drv2: number;
  drv3: number;
  drv4: number;
  productAccountKey: PublicKey;
  nextPriceAccountKey: PublicKey | null;
  previousSlot: bigint;
  previousPriceComponent: bigint;
  previousPrice: number;
  previousConfidenceComponent: bigint;
  previousConfidence: number;
  previousTimestamp: bigint;
  priceComponents: PriceComponent[];
  aggregate: Price;
  // The current price and confidence and status. The typical use of this interface is to consume these three fields.
  // If undefined, Pyth does not currently have price information for this product. This condition can
  // happen for various reasons (e.g., US equity market is closed, or insufficient publishers), and your
  // application should handle it gracefully. Note that other raw price information fields (such as
  // aggregate.price) may be defined even if this is undefined; you most likely should not use those fields,
  // as their value can be arbitrary when this is undefined.
  price: number | undefined;
  confidence: number | undefined;
  status: PriceStatus;
}

export interface Base {
  magic: number;
  version: number;
  type: AccountType;
  size: number;
}

export enum AccountType {
  Unknown,
  Mapping,
  Product,
  Price,
  Test,
  Permission,
}

export enum PriceType {
  Unknown,
  Price,
}

/**
 * valueComponent = numerator / denominator
 * value = valueComponent * 10 ^ exponent (from PriceData)
 */
export interface Ema {
  valueComponent: bigint;
  value: number;
  numerator: bigint;
  denominator: bigint;
}

export interface PriceComponent {
  publisher: PublicKey;
  aggregate: Price;
  latest: Price;
}

// Provide currentSlot when available to allow status to consider the case when price goes stale. It is optional because
// it requires an extra request to get it when it is not available which is not always efficient.
export const parsePriceData = (data: Buffer, currentSlot?: number): PriceData => {
  // pyth magic number
  const magic = data.readUInt32LE(0);
  // program version
  const version = data.readUInt32LE(4);
  // account type
  const type = data.readUInt32LE(8);
  // price account size
  const size = data.readUInt32LE(12);
  // price or calculation type
  const priceType: PriceType = data.readUInt32LE(16);
  // price exponent
  const exponent = data.readInt32LE(20);
  // number of component prices
  const numComponentPrices = data.readUInt32LE(24);
  // number of quoters that make up aggregate
  const numQuoters = data.readUInt32LE(28);
  // slot of last valid (not unknown) aggregate price
  const lastSlot = readBigUInt64LE(data, 32);
  // valid on-chain slot of aggregate price
  const validSlot = readBigUInt64LE(data, 40);
  // exponential moving average price
  const emaPrice = parseEma(data.slice(48, 72), exponent);
  // exponential moving average confidence interval
  const emaConfidence = parseEma(data.slice(72, 96), exponent);
  // timestamp of the current price
  const timestamp = readBigInt64LE(data, 96);
  // minimum number of publishers for status to be TRADING
  const minPublishers = data.readUInt8(104);
  // space for future derived values
  const drv2 = data.readInt8(105);
  // space for future derived values
  const drv3 = data.readInt16LE(106);
  // space for future derived values
  const drv4 = data.readInt32LE(108);
  // product id / reference account
  const productAccountKey = new PublicKey(data.slice(112, 144));
  // next price account in list
  const nextPriceAccountKey = PKorNull(data.slice(144, 176));
  // valid slot of previous update
  const previousSlot = readBigUInt64LE(data, 176);
  // aggregate price of previous update
  const previousPriceComponent = readBigInt64LE(data, 184);
  const previousPrice = Number(previousPriceComponent) * 10 ** exponent;
  // confidence interval of previous update
  const previousConfidenceComponent = readBigUInt64LE(data, 192);
  const previousConfidence = Number(previousConfidenceComponent) * 10 ** exponent;
  // space for future derived values
  const previousTimestamp = readBigInt64LE(data, 200);
  const aggregate = parsePriceInfo(data.slice(208, 240), exponent);

  let status = aggregate.status;

  if (currentSlot && status === PriceStatus.Trading) {
    if (currentSlot - aggregate.publishSlot > MAX_SLOT_DIFFERENCE) {
      status = PriceStatus.Unknown;
    }
  }

  let price;
  let confidence;
  if (status === PriceStatus.Trading) {
    price = aggregate.price;
    confidence = aggregate.confidence;
  }

  // price components - up to 32
  const priceComponents: PriceComponent[] = [];
  let offset = 240;
  while (priceComponents.length < numComponentPrices) {
    const publisher = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const componentAggregate = parsePriceInfo(data.slice(offset, offset + 32), exponent);
    offset += 32;
    const latest = parsePriceInfo(data.slice(offset, offset + 32), exponent);
    offset += 32;
    priceComponents.push({ publisher, aggregate: componentAggregate, latest });
  }

  return {
    magic,
    version,
    type,
    size,
    priceType,
    exponent,
    numComponentPrices,
    numQuoters,
    lastSlot,
    validSlot,
    emaPrice,
    emaConfidence,
    timestamp,
    minPublishers,
    drv2,
    drv3,
    drv4,
    productAccountKey,
    nextPriceAccountKey,
    previousSlot,
    previousPriceComponent,
    previousPrice,
    previousConfidenceComponent,
    previousConfidence,
    previousTimestamp,
    aggregate,
    priceComponents,
    price,
    confidence,
    status,
  };
};

const parseEma = (data: Buffer, exponent: number): Ema => {
  // current value of ema
  const valueComponent = readBigInt64LE(data, 0);
  const value = Number(valueComponent) * 10 ** exponent;
  // numerator state for next update
  const numerator = readBigInt64LE(data, 8);
  // denominator state for next update
  const denominator = readBigInt64LE(data, 16);
  return { valueComponent, value, numerator, denominator };
};
