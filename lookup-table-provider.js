"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupTableProvider = void 0;
var web3_js_1 = require("@solana/web3.js");
var geyser_js_1 = require("./clients/geyser.js");
var rpc_js_1 = require("./clients/rpc.js");
var logger_1 = require("./logger");
/**
 * this class solves 2 problems:
 * 1. cache and geyser subscribe to lookup tables for fast retreival
 * 2. compute the ideal lookup tables for a set of addresses
 *
 * the second problem/solution is needed because jito bundles can not include a a txn that uses a lookup table
 * that has been modified in the same bundle. so this class caches all lookups and then computes the ideal lookup tables
 * for a set of addresses used by the arb txn so that the arb txn size is reduced below the maximum.
 */
var LookupTableProvider = /** @class */ (function () {
    function LookupTableProvider() {
        this.lookupTables = new Map();
        this.lookupTablesForAddress = new Map();
        this.addressesForLookupTable = new Map();
        this.geyserClient = new geyser_js_1.GeyserProgramUpdateClient(web3_js_1.AddressLookupTableProgram.programId, this.processLookupTableUpdate.bind(this));
    }
    LookupTableProvider.prototype.updateCache = function (lutAddress, lutAccount) {
        if (!lutAccount.isActive()) {
            return;
        }
        this.lookupTables.set(lutAddress.toBase58(), lutAccount);
        this.addressesForLookupTable.set(lutAddress.toBase58(), new Set());
        for (var _i = 0, _a = lutAccount.state.addresses; _i < _a.length; _i++) {
            var address = _a[_i];
            var addressStr = address.toBase58();
            this.addressesForLookupTable.get(lutAddress.toBase58()).add(addressStr);
            if (!this.lookupTablesForAddress.has(addressStr)) {
                this.lookupTablesForAddress.set(addressStr, new Set());
            }
            this.lookupTablesForAddress.get(addressStr).add(lutAddress.toBase58());
        }
    };
    LookupTableProvider.prototype.processLookupTableUpdate = function (lutAddress, data) {
        var lutAccount = new web3_js_1.AddressLookupTableAccount({
            key: lutAddress,
            state: web3_js_1.AddressLookupTableAccount.deserialize(data.data),
        });
        this.updateCache(lutAddress, lutAccount);
        return;
    };
    LookupTableProvider.prototype.getLookupTable = function (lutAddress) {
        return __awaiter(this, void 0, void 0, function () {
            var lutAddressStr, lut;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        lutAddressStr = lutAddress.toBase58();
                        if (this.lookupTables.has(lutAddressStr)) {
                            return [2 /*return*/, this.lookupTables.get(lutAddressStr)];
                        }
                        return [4 /*yield*/, rpc_js_1.connection.getAddressLookupTable(lutAddress)];
                    case 1:
                        lut = _a.sent();
                        if (lut.value === null || lut.value.isActive() === false) {
                            return [2 /*return*/, null];
                        }
                        this.updateCache(lutAddress, lut.value);
                        return [2 /*return*/, lut.value];
                }
            });
        });
    };
    LookupTableProvider.prototype.computeIdealLookupTablesForAddresses = function (addresses) {
        var MIN_ADDRESSES_TO_INCLUDE_TABLE = 2;
        var MAX_TABLE_COUNT = 3;
        var startCalc = Date.now();
        var addressSet = new Set();
        var tableIntersections = new Map();
        var selectedTables = [];
        var remainingAddresses = new Set();
        var numAddressesTakenCareOf = 0;
        for (var _i = 0, addresses_1 = addresses; _i < addresses_1.length; _i++) {
            var address = addresses_1[_i];
            var addressStr = address.toBase58();
            if (addressSet.has(addressStr))
                continue;
            addressSet.add(addressStr);
            var tablesForAddress = this.lookupTablesForAddress.get(addressStr) || new Set();
            if (tablesForAddress.size === 0)
                continue;
            remainingAddresses.add(addressStr);
            for (var _a = 0, tablesForAddress_1 = tablesForAddress; _a < tablesForAddress_1.length; _a++) {
                var table = tablesForAddress_1[_a];
                var intersectionCount = tableIntersections.get(table) || 0;
                tableIntersections.set(table, intersectionCount + 1);
            }
        }
        var sortedIntersectionArray = Array.from(tableIntersections.entries()).sort(function (a, b) { return b[1] - a[1]; });
        var _loop_1 = function (lutKey, intersectionSize) {
            if (intersectionSize < MIN_ADDRESSES_TO_INCLUDE_TABLE)
                return "break";
            if (selectedTables.length >= MAX_TABLE_COUNT)
                return "break";
            if (remainingAddresses.size <= 1)
                return "break";
            var lutAddresses = this_1.addressesForLookupTable.get(lutKey);
            var addressMatches = new Set(__spreadArray([], remainingAddresses, true).filter(function (x) { return lutAddresses.has(x); }));
            if (addressMatches.size >= MIN_ADDRESSES_TO_INCLUDE_TABLE) {
                selectedTables.push(this_1.lookupTables.get(lutKey));
                for (var _d = 0, addressMatches_1 = addressMatches; _d < addressMatches_1.length; _d++) {
                    var address = addressMatches_1[_d];
                    remainingAddresses.delete(address);
                    numAddressesTakenCareOf++;
                }
            }
        };
        var this_1 = this;
        for (var _b = 0, sortedIntersectionArray_1 = sortedIntersectionArray; _b < sortedIntersectionArray_1.length; _b++) {
            var _c = sortedIntersectionArray_1[_b], lutKey = _c[0], intersectionSize = _c[1];
            var state_1 = _loop_1(lutKey, intersectionSize);
            if (state_1 === "break")
                break;
        }
        logger_1.logger.info("Reduced ".concat(addressSet.size, " different addresses to ").concat(selectedTables.length, " lookup tables from ").concat(sortedIntersectionArray.length, " (").concat(this.lookupTables.size, ") candidates, with ").concat(addressSet.size - numAddressesTakenCareOf, " missing addresses in ").concat(Date.now() - startCalc, "ms."));
        return selectedTables;
    };
    return LookupTableProvider;
}());
var lookupTableProvider = new LookupTableProvider();
exports.lookupTableProvider = lookupTableProvider;
var myLuts = ["13SRwW27Y6G7tdyQVXNf2UjkQbWiKxTagv3nkm91un4k", "14dQCYUdaFkCRrQC4unjxgEsbXZvmj2p8hpQLTqv1k95", "21o9L1Wen2iPQXYAJXYRGmkX1RLgnVFTg6B75AVi2RPJ", "2CGHiTsjHFZjnFU6LCV7bD1tp3cetWtZXoTsjuEVbEw2", "2DT2L1FoJnTrhCMEXrDLbENuvXYnSksMGNSN5dk5PJ54", "2GYrxY3vHxkbfBmUxrpgXqosfpmm183WVxRBEn1SMbSH", "2L5qYgb3HBSWpJmxBsbUPLeB83neVooSbzfQ12Nf8Uvo", "2U6ymjBufYgG3NBarTmHz57AtVtUEBzaVDSXmu2tgy5W", "2VW8xtAsxxvAoV1mPgTqrzQQ93DjnUU3P12UE4STfsGQ", "2YB5WaxMwC7pycSDFXbWHNq3w4vEMruqxQczyV1aiqq6", "2bqTpoS7RF9jcYkYx5umvRxhYyMG4mfxQovRN8ZEGzvm", "2ecDCzo5kP4jGReBYDTp2ofzFekhTJeEx5gv58j6g2DK", "2oJ2fxm3T5cGfnuP91Phn11F9ssY9aUftSHrCbCh9Unm", "2qBiGLEEAtwPw6sNjeEcBr6MDNZwWDcAX2KyMUw3pT8g", "37GucWpCCoVQSF2wQbRipHyy5fzJAxArswNjfQMZmZfQ", "3HQTHfbEe8DMX1bRBu9C5CXebWdoW5P94S2UH2BbVaBX", "3HW2dP5rycGqS7QNZjizLb1iRYsJSHKmxmgT3QZFd7G6", "3LTTJcyqBAQ91sxqRiA8HEHutvcSjse6RP6KpSbBwSPN", "3Mu6wetYRoY7p9ENPoiRkWGNuiCuG1CYCkWb5rK2TT7o", "3NzXFFF2e2y3XJ8GXtzzBHbGnn7jPTx3Ckju2qSHSsXx", "3P9dXbjEbhuJAWjG8gzrBFiMH3mr6coRrAfVsZssfPH3", "3RnujHhDXwDAXNLi5edNzzbcQpisHKNXhog99GXp64Uw", "3SQHeP9QpGFxUqsX3ucSZYD479g88F1FijLW8i8VPhg6", "3SSQjjBitzYVUQ8Pi68HYGhp51Hb3nSqj8BcGN7mRAwe", "3Wucowqi6bh26AFF1SxbF4mtbq56zumcCqgvmSHW7PdU", "3ZRNGgi8eHacEgPBAEpQBwEvKj7qtstZZUmmxKpdQiAn", "3i33uBDaBdsdjcht3FjhXdmtQmbc3EJwHVJze3jB48VW", "3pnrSx6YYzrx69V3aVBPGvpD3zZmU8mffoxbqv6Roq8P", "3rZ9zznF2bbpPmZRQKcpHGwbwJrcQB2ArNnpbXcVPmMT", "3uQBWHLzVNgJyT32e51X2euY2hvMe1LfR5ztu4FWvWUe", "3yg3PND9XDBd7VnZAoHXFRvyFfjPzR8RNb1G1AS9GwH6", "45fK5NPkB66nTTMHyRcWpcYgwNXrfAnYPdddLcy4TRR6", "49kSE5F54Sjra8mzNKknjtpnjqnaDNjPDoPZ4Qm4KKMT", "4AbcAPVkotQZbR6QCujT6mhwX3tFfZPdiF6DMHeLFHY3", "4HK2ziGrikJUy9sJd8bcNFkMJWgav6BUeRE1vABgLJG8", "4WYxm83Wpy4KCTP2x4w3EAbXZDhBko9Zr8mc4xMoc8iL", "4ZCWXLRcAhaNJxDRBfpe9iM8nozPNHUGJyRAJGQNYUWr", "4d7SnQmwhR7AuCqcr3Kutb9WZNyvntveeNnMHhDz4XL5", "4ic9Pe2qYxAK17A8rsiYoCiR9S5tfgq1Uw1KPhvorUVj", "4juUyt4HdhMxMTPLLRPuomjfpRSvQ4gZmfYdQWSZiU2C", "4qJsnySC9dhAPnso2hQCrEpksKNBk8iyfWsQtWH8pBPx", "4yXQBTQy7VcWdH5BSb1jEy2VnatHhZTNmB9VB4WTRNWm", "52AjbgtxUi5Jvo7RSwBrQR8zZ5saAexNvQ1xLPpVhKEa", "56fyiRLXfYqcQyYoUN6JToWkLAXo8nBqTy5FaLpwU95M", "58kebPUtTR4kc5wGP7r2YuTfGpz1MC9xNbAnf5AxWLZs", "59RZEsC8rqyAUX4QmSvRACGAfcNYLrfugyjbYbift6UJ", "5Bkk7RrVTnRoSvkKMRwbzcnGC1hZuiDsHm8xSHWC9QKv", "5KfBaUgrUsRadYVXqYEivyiowp8xLaHVmgVy9A2NpVwK", "5TuGRvX9DVKWFFxt99wn7tv49atuqjYNbRXeTEPAaTjv", "5VxDsrELsRXukQmcFs97834fVQH7G95AR1M8Cguscpks", "5h46TkBZMs6L8NAkhDtBR7QS1kwr9tLrpF64VyKWokh1", "5jBGwthAto9bnvF78kn26tVL2HSvXLvnWKVo4aF3qQwe", "5neW3VjpTqdN7kaNPJYi2Ny7qJa623mkHxjZjCMTJiVm", "5ooCWJDSNJtUfwuheBxiqSVutS4vZkpcJp3PzN4t4KQj", "5pvMUYW9Nc87sFyfAC8NvK1VnWHzVi3nRAQoV3BuX5FZ", "5qbzsFrEjFgQxaWw2LMaCfGfrw6g96SB8BDMbW846G8h", "5xNRDZfC79Lws24e2y6SJnkqbQhfssE9rwcVKUgPL9Db", "5z8tC2RSM1akdkNhyV3d3pjbE82b6Uuz32y3ZA1efLwB", "61aEmS9uPEu2GKRmSYZtQqHaEpXCLhUn677WaNRrzxU8", "61s6dAx3E6c7FpiBb9etM8QW9n721K6vf8tQMF5kegmW", "67xWaT4BTtKQSEK2KNtePRahLTUUtNYh2qMESCX4wjn4", "6A5Np3zL1X5NJSP7sVerSFtg1YpYKtJgF5EjiscQo6aL", "6GqPQwWppzPBmickrcmHEYAx6vkyxexggCK2zaCKo9k", "6NBc6GdMhwSqYYG8nWCjqhneT6VTmNi78DdRTBmPoqGH", "6Q1RwKZLPJcGA9Hv9wWfKjCdnuaxq43QY4WcjwxXakXu", "6Vik7TRw9Hqn7ET6EbYBUqmRfyVsrFFvfg1qCiXvDceE", "6auuUE9cWpR7gUePBuVcYBoAG5Lfnjj83DGppLarwDM6", "6ccc92RxcSLRagDdTxYKKD3WcTSC6BZu6C4bVhWj32FZ", "6rPX9ynmWgYK1HhaWjts6hhuW2oKtrr4u3xVisKaJK4w", "6xarxzrJeq7DspYo8EYEGTSorEybj58zxvormw2b2Jri", "75PdmiD6WpdeW4dyXxVvLB6h1TbgaXib9YzYRXPHWUKk", "786V4CP1dVgELbbo1Xp98tUJxsQHgNyKwZvHL1AzPctV", "78dftAQJA7e12cjJaZSxmHBh7MQfvduCh9mpdtc81ZhD", "7945hecmxo3EsFA4vuyG3qQtzuPmawqR7MJFQ2LwPMAF", "7BfgjoRYwEgX8obk8iCNSyxucMJbBPcnh7gW8PPey484", "7Nrz1rBTK42yjBV2CrmDRs8Zw6u1dVFgubzaRX3DLtFh", "7VwwKaGBS6soXWKq8W8xZp5wquDxCxMDTPvswUoWm1Xz", "7WxMftFpW86xZqdWWHRavEmch1pXM4tJQvE72zDEPf5J", "7YDk5sCLcYJdh8ViVAoM4WRee4j6isvYdQiNZYTPCjoA", "7fDMjx9gvZ6R4msPNZLkAfAprFPhATAdAWbctX3LW5KK", "7mEgqCTNSVgVwshbzDCmKdorvjRcR46F7wXPyK2XguS5", "7mwRwfZbWmo7sXRFAkgBeVrJbE9sgvv2qoeE1LfYigMQ", "7xa7dvvs9yWzwSkKQsUGKSJxp44r1WmVxyfpSPPkLXgv", "7zJVd1oAttFtcDPzjjeHuCTwKsGvZ3dzZVcvjvSaoUBX", "82cAumjPFYUt1wfsttV9CdRoJL3V7bSF8WAF97UVuaWc", "86BzA2F67GYZfAsNZtayLP7DzKCTsaTVTzYRTkGpt2rE", "87DVyvdvTMrvRzTP7P7DuXUFxs1eLCfLs3VMWTAUfhYs", "88xKEYuMo81q8YqJYdzhDDs2GhxpXuFjcNyaqmDD3ZkN", "8Bd2K7MNaPfRWKYBg9XKFCRPt7f3q47AXPvb6zyQ4S1C", "8HKWV5EHwg2pY7QnQATyXUHMSoRustXEyEqa5JvuRf89", "8PmUoPWfexrLAUFXNTQWL14tCFUYVGxgGgD1ac5Xrrcp", "8PvtmQZzH88zj7PQWuYDfJPkvKsNMvcnjiRpY7nanhzK", "8TKgJfR2bRNxCjDM1r6mKGa7gGPEM4S4w6MqBavPF447", "8VSLmUxxf9zkR96e6vhu3RH3Tm9ajWbR1yZvh2eZ5axF", "8XjDfF3TuUMNJdNFy3HmE8iULbWC2H2BDNmM248tKbpk", "8YiuxA6ZQjxyNXgqNyPuqcM3DsN1DXef84ML5xsDdfxA", "8d4jdZJNnoeEhAzNsnGw9DZoBTXKqYGQu3G49ZdXPC2f", "8eNy4fmhyL8bLo3w2TLjXzMMkFMgebFkXctcyjeB8KzA", "8nf2Kdvy1QnJhoM49XefUVm98DHwCJjgxQXMrLyLbxe5", "8smoradxrLK4njaN68u6Qig9kM7fQNEsXmWVVCkTp8wo", "8teDmvLqvD7ST3UByUtPKDsDqC1ht8KFcdqBNG2an3Sv", "8w8fN17v4mvh7qYTz8JkNuBL69RtecL12rM4sBJwpyzq", "8wMbSSmm6oYaGtQfhEGfUdGwH8hAhaTisNKxYjwSC3hg", "8wj9MXEzXktArpuoAst69QPxHweDrsz1QfvuG4AW2HF", "984Vy8z8Lv5Uh9PrJeN91To9yovCukNjCjRsEwroJzTE", "9C7L1tkcAPsAo2cHEaDAHacA7iMZZsitf2hLAMpyUUgy", "9Cn7Eg2Je4XXkaTAwZswqnBNUemLDDxQauUWGfGG6WtZ", "9HtCHvnREvQpRivzG43wdCnSXD7EEfsJq1QGeMGnx9iQ", "9JGUiSR6VWbkp2KXFFG2FKmrBjDaRHACXauEDaJhscxb", "9KMcKqtJhsbmcS5d9wwXZS6nNbV77N9JQ6siHPJLhs3u", "9SLho9uZniJ6NmRPtAbAdxw9i3Mwvc7xwjhiaKK8hQM", "9TXrgZ139qce4oLcQXsDB4JWPay9npb3qYqzd5epSrq", "9jcw8XDvbeD3ZatsTp2i6U8MgbzmJ1fmJUNMQLaEVfWm", "9q6LoddjvezHwuSBJhfEYJfiMqT8nsJXTWBMsAdo1UqA", "9tgTkKMMynXTcRwFnKktLkExQBPo8QsPCBhkxSPM5YAA", "9uF1fg8ZP9v6zTmDxC9DRnAq6HYUp2nvahy5ZmCVxxqi", "9zQohSmqV3tuwHsgzskccNn9YGXjKnw24nH4ynYfaTAs", "A6B1fuuLLSwN4vBatyGeqBhNYbGyRod5fAUt8EBBqPC3", "AF1C4K4QSqPMDk8oLYDGGyanxAyFnnmjRxihpFSQ9cYv", "AFXo68AtaURsjcy9KMQwyB6FdNbHB6SL9BnDV1tfK2uH", "AKgPcZCkzUYLegD5Hayxz8rapEDHJWsDZJiZYoXRSKN3", "APMazU4MaibWByd6BgkfJanyuB2AknRhkgEFy5Yhuhiu", "APnkLnBzwnL2BwzQdoDrs23QCqN9rVujGB2WEUeH63rh", "AWwL61VrcZzmzJWKJ4sqxX9WKwZnpQ5p3ciYgX3pqJQU", "Aas9yHSriUKGhwrQ6rZK1YdhMBSFwELCBidj8G9VjD2t", "Ah6cS3uCEASfpdp7jsPZC22zk2cx44nnYNEaDp2DRUSp", "AmKuu2h3HVELQQ9KHdQid7wdVnfq7AgGLubNQYWVBTgN", "AyeJ6DfYwinLYQuQetyi3gxEH59N9fivKcAw2muDY3wB", "B9yMBk1NmxrzTQu5UAuyC5nsT2HLd1MQrycXyjNF1DPb", "BAguMyk2TCjEGWi4iACWkCECAZWi1GmknQB3HZiJW1xy", "BBfjNDm2y7aTzzukDXVciLckpyXUrTkYe7yakQbsmfwo", "BFDfKbRbRWJyGyeAjKD4ecDvibVhjYEDjxiXTQBHVKnz", "BHbzjcu4bgTe1YPhfiVWywjPpu14CvL5jEGaSoYgBWFo", "BKGV858RGHZBmrTLtvFC649y6gUBSxmhLSZv3PmsWQkn", "BS3gqxaJKr4BBrZzexAyj24FRBAP9dgVdzXj1TVka8z1", "BT4nbtF7kzm4zEgM1ZGN7eYQ4P2sSMQDZP4fvcjiEUex", "BUZLGNcx8kg15tepWVrdj9MiQbPjgUvU4ux8PRF5sXNL", "Ba3ScQLaunejxG384HN5dHtnZL2kBkg7hLPvL8he7cJR", "BatcQg4kX8BtTbafWz8tqmkhQVHpYYvKoEB3qAZgtBWD", "Bb9NXJD1N27LgFXDtxqECVZMHftzeecvVW4UkFJKG22Y", "BbHQXTDgruhVYwGWyNgQtbVvusDZiUaYZQmGbCAZ5Hjp", "BcGR4NsLPwsX1pFjKTrVprracwiJdRY5rAgpoQSfEpi2", "Bdxz5yzH6Nb1wgQRET7Qp6MP36dyQ7Kicvam1sezoE5i", "Bick5U7oEswXhuECydbCHQwgwFpAzMYZrrnRraZcSYFm", "Bjhfky7U27QntihaEavpZiG1rLnsHMt7Eiz5sEFJ7pw3", "BmmKnpzPdYyiDw3GkcfYHEtmhZ8qQtUDGtZPZU6TWhj2", "BtWFW5LCnUgKQCXk7fTPCKuZaSjg3rX9S3LAdKd8qcyj", "BuwQSUuhDZSgy9zT9sa7Ja1iGgkvhLBBuEJabd45A5x8", "BvZeizxGznKosTy1nmX7gJPUgDbpt6fPHUMg1Jo3kRum", "BvpgEG1gEGxyuC6k63pJwsGLyDPzagnQahmGhnuic4Ad", "BzUHpqiZx7tdEsKqsGZynGz5v9JcjSFfFrJ9G6AhYkr3", "C5h965GSxdRkA6tbcPnpSGWRqr5tiQwwu7n6Pqbdsncg", "CBfYki55d9tSDGSkiXKj4ZVYNxrhCjYrYV6fXnwLnfX7", "CBt23dUgdqU1d8rb7hjfuvjootRpYoS1gw6jVPJv1S24", "CPSYZVKHbJRaNJNGNnm9HV7ogwrUr9QEAQtWSh18wYW4", "Cb32bjkQHGjfzW1hDYRxeV1VkJf7cLtUvfvdoWGdumhw", "CeFtyxQaJgY2wFBgVFrWn3VtezDovEanXezS3f8Q7VnY", "CeWpfjDuzqtpBoTYM3XJeL6ujXW96FZSZxS8sawPVDp2", "CeoGFiNunFTE6UMAeWkqSL2vBEJfLEEKsybmPjUFW6zX", "CipHxV3h6DvekpQJC3GVB9Zv2YKdnPAFzqn2co7cRhco", "CjNy85VxnPjrc7E53MteMpwFEfQA5JxbrESQCCqufAMu", "CkG1cRE2NEjKAFdyUF4BhcTSoyx88VD7GRbjY5CzeWyb", "CmSnknvFC3tdtQ3VF7bKD3NrZcJqpK6J95RgtSYmpyjz", "CpJwoX2j8uE2Xo6jt6xoPD2fgdE6VFW5k1NrqyiZo76w", "CpqqZT9tbzYXryhpVkKSsoLiVHj4C2VHv4Ckv7DTAaSd", "CsLXVSQ2cRg4Vd8NFyVdCb1se9T7RLa33EyUTZr59jr4", "CzHXnKRoP37BEh7EdXJeteU3ZaxXvfHRp9NmXZxJJYSZ", "DDDc5h832Z7VDpBXfg9HbA1U9DjjLBN8eKEnX56TDB7o", "DG1PPuhhbcDRtw7e11FGoPRaEQaJkw2LhRFCeoJfh8rk", "DNs7kSGhTJRXiwqvsMZuMJjA9jFPtirX6ErtMzSwzW81", "DS9xyrNhhALydb5ky9dqueHDADNhBgwnxBVPqdSdsvw1", "DWJWV2QMjFPxYh6za3B8esAs3BsFtfBmk18oRC1SMhqt", "DdT8cVU44kZ63kVQ8Kv87fk5Wqis5YjTmtZGyZLmB8hn", "DfLHj8XXZRnV6NQTNPSwW6PYPcuwe2gZMLph3pHepUTX", "Dx19fropWcXjkgmpT2jLPLNhhKmjiN5tsPHY9Px5y9UT", "DzMWG1Wg7c8aAoj5E8sWPS37fMbxFVaMhdnrvwVpQssm", "E6ivXoJ6Dh3QoJ1ikpJznLMwrcQHdwsMGvtP8HRjSsfs", "EG27xSBM3WGbqg9My8HJdqYNdohrvpYUPXTMvgkEMJs", "EKdHdNDdHxYRwLnY99yrrnDjgTS532NgTm7mRT75g25a", "ELiBr8J1AH6eVFEMf89wUECFziuSPsydbWwKCDxUwsmz", "EQtod32xzYJTvCXQ4XMT49bHVEUpAwoPJ2QKuNjXRP1P", "ESozVJjDrDzJA3VySHAPbRrRTvqkKFd2q8GDWLZBMLep", "EZCzbM5eTVEpTnKQXhduDsSguHiEpyXQGyvrFbUSwANm", "Ec58hQDMqPBGRDVhuZ6i7e3zFi1PJtUEMfBxF3k25qfo", "EgfvwoENWMNVowEMkyQAU9sWX9tvwVVu9NmoiZLWEMSc", "EhGsDj1wik4juYW3itXK6QG4Snd1atLYBsaQt4DFhrae", "EmZA9dYefRsBnv6oCkpiGyWynkEoRahaRXZfEFPgNXEK", "EnMkme6U2n8wKuxDBGA1woVHFJBjke8C9PpEXKxJ78hq", "Etkp2SMeXLeiDKGyjKLSgaW2xUwoBGUAuMmG8DKz4yKw", "ExH8FRdyRpXUZX7GCBqKJsTyJiQo4kNgGFMBZSxXg3VQ", "F5g3Y4LdgyBJyZWBfsgzimqsFfXMdqs3y88vYQWhiEX7", "FJksmiVET4Hj6P7zLJpKFXtQQFWRVZSvmrwEk1MPR12X", "FQ9oecWNNiqkbPq2edQQendvFmNcbiLWfcDN6m8Bvadd", "FSMCT7sRTk7uwNXLdGnTBHVG2KbXqxekvVKXybdYYwRz", "FYFzNv98C5PY2nZKvZbq7CBstJV6Y6XE2KCCWrSdnyxz", "FeXRmSWmwChZbB2EC7Qjw9XKk28yBrPj3k3nzT1DKfak", "FgZkP8CHMLs1Gcbk9Ra6jhGprVRi8svcEjFeuWBGwYtc", "FkNmLNSYu4YvoBeLp1JCDskzFa5tqX12bFH4MhPipmsu", "Foc1hfFq6rGqafWuH5d8mnnHU68VWJVsHQCEDJA8xUCd", "FqnF7n5dGVXZYc7SV76iQRpsqge2gnr9LtQ2P1UnNiQL", "FrgKjLJa1BQWuGaVtoMEwLP7Sk6ktz5hV9zAdysZCbYn", "FtjfM3UQTXgNqc7DzV8DZhFNdJh1f96WSeGK7KnZJRmd", "FvREbLfdEGVQx2zQDNTrntQqBMpvk7PZg13BkMZZbSZv", "GJgrbjiMuxa9u5CCKBDGR5t8MAUsFsK6u9k7KbvxE7Td", "GNxjF9ewKmfZGqsRMN2GBkyR86cCwMdMX2hGqcysWkKA", "GPWttHd9ddXSK9xPX3E2NLgyKRXTzH9TUhykq4XTp3UU", "GPfSaf27dVNJUUsDdE7ih3WHNPktzeZC85fNftxiiX3G", "GT232VVeZDfbXKqzTyibmhaNeBCqxd5VWx4cb2mXv4Ji", "GZ4ZZHwjLUdjbqUkURjXx962rQV4VgvWHcaM3nDiUVVN", "Gg64qe83QvVmvKEq48PhDtdofRq5gUXiqjvKrA6USAoY", "GitmBf9cDxckGqJARQBaWYYY9XrMxChDW2ftVUZvu1Dq", "GkjEEgdpLeE8XSF3dsyk5e7fKKaFCSgrbLxHbeVkwfTA", "GpmbGou4dZQu8DGyUbu3RBuu597w26oRxAGX3LQfBGX5", "GrvcWMjdTHPBbED3qFpYGtFgyb3iZbGbjk2LALJk2LdD", "H5XJ2xsmmEPh9RdYh3wLVfTGbtsir4Wfgf3jPJsmg6KS", "HBW6E4KEyy6MMUA4JLMMAyrWpTZN8QJmZNPCtxjYYKt3", "HDbFEyuiGVDjer87j7uP53sgw1CUVaGUPA8Fi8G8eSbJ", "HJCf4ZGdQYYf1LZmdQhsrtt6S8h4BYgb33GQABf3civJ", "HPGj9FhGzW2jezm8Vh2du6Y5gyAEtb5osdwpYhiKgkST", "HQLyG59eKR6d9GHqkyGryXo5JfrBPJkem9HabcXW1ePf", "HRtUEKyQZnoBKsdZnEn8icYBfaAqjKjahPkfv6bVnpU5", "HTfuCQh2p6Fri19cgR7one6bVBDzGaYDsE2bUGgm3Xop", "HYmK4gFQqTerALUQVJgjC4EuQpFbTB8ZEWkiCzLGzqJr", "HbJ4ZvEYmjtgAe1nkW3mgH3oV93qnuwR3zprKmQF2YKk", "HdsLwejSPSoZvAKzJWoQHzZ8r9APAdjkknrZsos4ie7F", "HsFwgCKM4SSzRcBbCsAEkGFERHJtVwZGM4aQzsiXryJX", "Hw6C2b6wdaXB8fUqvmJ6H6Pt6D9UhJEa3zRu2oc4Peqs", "HxizTSeKAUnLGnpWzWJtv3BygG5y85YEt52byWKfoRby", "J38FNPXZnfYhyin251ZwSfmHAzSCVJRvntLgwn4ofkyU", "J3fGNsJXUcRXGz7fK3tmEnCXtnnPDGRnEmeneoFpbVwp", "J4c2nT868hLiErcJM7XsFWbAy949ft4ufXy6DNgg5SJG", "J71hkQNBrQqEuk8u5CQKLRw7a5NetW2MAcC8hbw3Htc6", "J73motbRk4WuL41XQ3dJrdd8aFyM2GffwnpNPaegvPyq", "JA5WgCJJEE2d2xA3s5z6L97tybLSNA58qFhZ7ANHRaSp", "JDtwEX5NLzy7bpSUz1mEszber3DrUEBLQNrxBPoEPyec", "McBLx9DofPkHDFHvVanm3QdcqYadUvLDmdGBWfb9yhP", "R64kDsxHNreKVVkGF2hSz7uGVFUs7Dge7N3MStkRt7W", "Wp3SQFA8HEQpmvWxQjUk9Rj6LoS3yikRwvrKasuNhZE", "XBcisRyZGU1nt1SwfYap4MPYT6M12aHL1EQr39TNBxR", "YHgW7rbGFkkX3QPc4cVAbPv5bypzE9pJL6MqfRscTYU", "fbjurag19RRmF3kvEXoAV2LCq8kkFe44EU8i8qmx8RT", "gJ6S8ncgDNacf6LQsqwEimzgbeYvxxBmNur9BW2RffH", "ojfnMvUqBXbzZtMYGgUSeNLCWXeR16GnJmFzZLPG16k", "ptz7tVdFpDocH9UfQU3gG5HkaLAMmUSoMRjztyc1zbc", "qAqxknmfxS6rQ4FGcwSfVZDLsPtbP1V5iXjds9sBs1S", "rUhWMjzjQDf2zU5KzGmDfoFnaefLXcmEBfJWFuSu2nx", "v7vgbAjX4BFUijq7T3biRUAwLqoKBqp2NjFarZbnNVy", "vMfpnsUJbTZU1M128qwGTzr8Vceyz3joC7jwXq287kA", "wZxvZKU71AVfn2jf83aXdYEaM6LLLPWuEiSayt6TMnb", "whnfFaHn716xcdpUvbqK818v4rPanurLkJbs3k2RtH2"];
for (var _i = 0, myLuts_1 = myLuts; _i < myLuts_1.length; _i++) {
    var lut = myLuts_1[_i];
    lookupTableProvider.getLookupTable(new web3_js_1.PublicKey(lut));
}
