import {Transaction, TxOut, CoinControl, ElysiumData} from '../../daemon/firod';
import Vue from "vue";
import {cloneDeep, fromPairs} from "lodash";

export interface TXO extends TxOut {
    blockHash?: string;
    blockHeight?: number;
    blockTime?: number;
    isInstantSendLocked: boolean;

    txid: string;
    index: number;
    // This indicates whether this input should be used for new private transactions.
    isPrivate: boolean;
    // This indicates whether the transaction as a whole was private.
    inputPrivacy: 'public' | 'zerocoin' | 'sigma' | 'lelantus' | 'mined';
    validAt: number;
    firstSeenAt: number;
    isFromMe: boolean;
    fee: number;
    spendSize?: number; // undefined if unknown
    elysium?: ElysiumData;
}

function txosFromTx(tx: Transaction): TXO[] {
    const txos: TXO[] = [];

    let index = -1;
    for (const txout of tx.outputs) {
        index += 1;

        // This is for txouts of multi-recipient transactions that we've received funds from that go to other wallets.
        if (!tx.isFromMe && !txout.isToMe && !tx.elysium.isToMe) continue;

        let spendSize = undefined;
        switch (txout.scriptType) {
            case "lelantus-mint":
            case "lelantus-jmint":
            case "lelantus-joinsplit":
            case "sigma-mint":
            case "sigma-spend":
                spendSize = 2560;
                break;

            case "pay-to-public-key":
                spendSize = 114;
                break;

            case "pay-to-public-key-hash":
            case "pay-to-script-hash":
                spendSize = 148;
                break;

            case "pay-to-witness-script-hash":
            case "zerocoin-mint":
            case "zerocoin-remint":
            case "zerocoin-spend":
            case "elysium":
                break;

            default:
                console.warn(`${tx.txid}-${index} has an unknown scriptType`);
        }

        const isPrivate = ['lelantus-mint', 'lelantus-jmint', 'sigma-mint'].includes(txout.scriptType)

        let validAt = Infinity;
        if (!tx.blockHeight && !tx.isInstantSendLocked) validAt = Infinity;
        else if (tx.inputType == "mined") validAt = tx.blockHeight + 101;
        else if (!isPrivate) validAt = 0;
        else if (isPrivate && tx.blockHeight) validAt = tx.blockHeight + 1;

        txos.push({
            blockHash: tx.blockHash,
            blockHeight: tx.blockHeight,
            blockTime: tx.blockTime,
            txid: tx.txid,
            index,
            isPrivate,
            inputPrivacy: tx.inputType,
            isFromMe: tx.isFromMe,
            validAt,
            firstSeenAt: tx.firstSeenAt,
            spendSize,
            fee: tx.fee,
            isInstantSendLocked: tx.isInstantSendLocked,
            elysium: tx.elysium,
            ...txout
        });
    }

    return txos;
}

const state = {
    transactions: <{[txid: string]: Transaction}>{}
};

let upcomingTransactions: {[txid: string]: Transaction} = {};
let upcomingTransactionsLastUpdated = Infinity;
let ticker;

const mutations = {
    setWalletState(state, walletState: Transaction[]) {
        if (!Object.keys(upcomingTransactions).length) {
            console.log('resetting upcomingTransactions');
            upcomingTransactions = cloneDeep(state.transactions);
        }

        for (const tx of walletState) {
            upcomingTransactions[tx.txid] = tx;
        }
        upcomingTransactionsLastUpdated = Date.now();

        if (!ticker) {
            console.log('updating transaction data');
            state.transactions = cloneDeep(upcomingTransactions)
            upcomingTransactionsLastUpdated = Infinity;
            ticker = setInterval(() => {
                if (upcomingTransactionsLastUpdated > Date.now() - 1000) return;
                console.log('updating transaction data');
                upcomingTransactionsLastUpdated = Infinity;
                state.transactions = cloneDeep(upcomingTransactions);
            }, 500);
        }
    },

    markSpentTransaction(state, inputs: CoinControl) {
        for (const input of inputs) {
            upcomingTransactions[input[0]].outputs[input[1]].isSpent = true;
            upcomingTransactionsLastUpdated = Date.now();
        }
    }
};

function selectUTXOs(isPrivate: boolean, amount: number, feePerKb: number, subtractFeeFromAmount: boolean, availableUTXOs: TXO[], coinControl: boolean): [number, TXO[]] {
    const constantSize = isPrivate ? 1234 : 78;

    if (coinControl) {
        if (availableUTXOs.find(utxo => utxo.isPrivate != isPrivate)) return undefined;

        // assume 5000 as the signature size for unknown outputs.
        const totalSize = constantSize + availableUTXOs.reduce((a, utxo) => a + utxo.spendSize || 5000, 0);
        const gathered = availableUTXOs.reduce((a, utxo) => a + utxo.amount, 0);

        let fee = Math.floor(totalSize / 1000 * feePerKb);
        if (fee === 0) fee = 1;

        if (subtractFeeFromAmount && fee >= amount) return undefined;
        if (gathered < (subtractFeeFromAmount ? amount : amount + fee)) {
            return undefined;
        }

        return [fee, availableUTXOs];
    }

    const utxos = availableUTXOs
        .filter(utxo => utxo.isPrivate == isPrivate)
        .sort((a, b) => b.amount - a.amount);

    let totalSize = constantSize;
    let gathered = 0;

    const selectedUTXOs = [];
    for (const utxo of utxos) {
        gathered += utxo.amount;
        totalSize += utxo.spendSize;
        selectedUTXOs.push(utxo);

        let fee = Math.floor(totalSize / 1000 * feePerKb);
        if (fee === 0) fee = 1;

        if (subtractFeeFromAmount && amount <= fee) continue;
        if (gathered >= (subtractFeeFromAmount ? amount : amount + fee)) {
            return [fee, selectedUTXOs];
        }
    }

    return undefined;
}

const getters = {
    transactions: (state): {[txid: string]: Transaction} => state.transactions,
    allTXOs: (state, getters): TXO[] => (<Transaction[]>Object.values(getters.transactions))
        .reduce((a: TXO[], tx: Transaction): TXO[] => a.concat(txosFromTx(tx)), []),
    TXOs: (state, getters): TXO[] => getters.allTXOs
        // Don't display orphaned mining transactions.
        .filter(txo => !(txo.blockHash && !txo.blockHeight && txo.inputPrivacy === 'mined'))
        // Hide Elysium notification transactions. These shouldn't be spent normally because a TXO outputting to a given
        // Elysium address is required to mint or spend publicly from that address.
        .filter(txo => !txo.isElysiumReferenceOutput),
    TXOMap: (state, getters): {[txidIndex: string]: TXO} => fromPairs(getters.TXOs.map(txo => [`${txo.txid}-${txo.index}`, txo])),
    UTXOs: (state, getters): TXO[] => getters.TXOs.filter((txo: TXO) => !txo.isSpent),
    availableUTXOs: (state, getters, rootState, rootGetters): TXO[] => getters.UTXOs.filter((txo: TXO) =>
        txo.isToMe &&
        // Elysium has reference outputs that we should not allow the user to spend.
        !txo.isElysiumReferenceOutput &&
        (rootGetters['App/allowBreakingMasternodes'] || !txo.isLocked) &&
        txo.spendSize &&
        txo.validAt <= rootGetters['ApiStatus/currentBlockHeight'] + 1
    ),

    // This will display:
    // 1) valid Elysium non-Lelantus Mint transactions
    // 2) unconfirmed Elysium non-Lelantus Mint from us
    // 3) InstantSend-locked non-Elysium transactions
    // 4) unconfirmed transactions from us
    // 5) mined non-Elysium transactions
    //
    // It will not display:
    // 1) mined and invalid Elysium transactions (whether or not they are from us)
    // 2) orphan transactions
    // 3) unconfirmed and non-InstantSend-locked transactions to us
    // 4) unconfirmed but InstantSend-locked Elysium transactions to us
    // 5) Elysium reference outputs
    // 6) Elysium Lelantus Mint transactions
    userVisibleTransactions: (state, getters, rootState, rootGetters): TXO[] => getters.TXOs
        .filter((txo: TXO) =>
                !txo.isChange &&
                !(txo.inputPrivacy === 'mined' && !txo.blockHeight) &&
                (
                    (
                        rootGetters['App/enableElysium'] &&
                        txo.scriptType === 'elysium' &&
                        txo.elysium &&
                        txo.elysium.property &&
                        ((txo.isFromMe && !txo.blockHeight) || txo.elysium.valid) &&
                        txo.elysium.type !== 'Lelantus Mint' &&
                        rootGetters['Elysium/selectedTokens'].includes(txo.elysium.property.creationTx)
                    )
                        ||
                    (!txo.elysium && txo.destination && (txo.isInstantSendLocked || txo.blockHeight || txo.isFromMe))
                )
        )
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt),

    selectInputs: (state, getters): (isPrivate: boolean, amount: number, feePerKb: number, subtractFeeFromAmount: boolean) => CoinControl => {
        getters.availableUTXOs;
        return (isPrivate: boolean, amount: number, feePerKb: number, subtractFeeFromAmount: boolean): CoinControl => {
            return selectUTXOs(isPrivate, amount, feePerKb, subtractFeeFromAmount, getters.availableUTXOs, false)[1].map(utxo => [utxo.txid, utxo.index]);
        }
    },

    calculateTransactionFee: (state, getters): (isPrivate: boolean, amount: number, feePerKb: number, subtractFeeFromAmount: boolean, coinControl?: TXO[]) => number => {
        getters.availableUTXOs;
        return (isPrivate: boolean, amount: number, feePerKb: number, subtractFeeFromAmount: boolean, coinControl?: TXO[]): number => {
            const x = selectUTXOs(isPrivate, amount, feePerKb, subtractFeeFromAmount, coinControl ? coinControl : getters.availableUTXOs, !!coinControl);
            return x && x[0];
        };
    }
};

export default {
    namespaced: true,
    state,
    mutations,
    getters
};
