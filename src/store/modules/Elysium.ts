import Vue from "vue";
import {ElysiumData, ElysiumPropertyData} from "../../daemon/firod";
import {cloneDeep} from "lodash";
import {TXO} from "./Transactions";

const state = {
    hasModifiedSelectedTokens: false,
    allSelectedTokens: <{[block1: string]: string[]}>{},
    tokenData: <{[id: number]: ElysiumPropertyData}>{}
};

const mutations = {
    addTokenData(state, tokenData: ElysiumPropertyData[]) {
        for (const token of tokenData) {
            const m = token.name.match(/^(.*) \(([A-Z0-9]{1,4})\)$/);
            Vue.set(state.tokenData, token.creationTx, {...token, nameMinusTicker: m ? m[1] : token.name, ticker: m ? m[2] : `E:${token.id || '...'}`});
        }
    },

    initSelectedTokens(state, allSelectedTokens) {
        state.allSelectedTokens = allSelectedTokens;
    },

    addSelectedTokens(state, [block1, tokens]: [string, number[]]) {
        const b = [...(state.allSelectedTokens[block1]||[])];
        for (const token of tokens) if (!b.includes(token)) b.push(token);
        state.hasModifiedSelectedTokens = true;
        Vue.set(state.allSelectedTokens, block1, b.sort());
    },

    removeSelectedTokens(state, [block1, tokens]: [string, number[]]) {
        state.hasModifiedSelectedTokens = true;
        Vue.set(state.allSelectedTokens, block1, (state.allSelectedTokens[block1] || []).filter(tk => !tokens.includes(tk)));
    }
};

const actions = {
    addSelectedTokens({commit, rootGetters}, tokens: number[]) {
        commit('addSelectedTokens', [rootGetters['ApiStatus/block1'], tokens]);
    },

    removeSelectedTokens({commit, rootGetters}, tokens: number[]) {
        commit('removeSelectedTokens', [rootGetters['ApiStatus/block1'], tokens]);
    }
};

interface ElysiumBalances {
    [id: string]: {
        priv: number,
        privUnconfirmed: number,
        pub: {
            [address: string]: number
        };
    };
}

const getters = {
    balances: (state, getters, rootState, rootGetters): ElysiumBalances => {
        const r: ElysiumBalances = {};
        for (const txo of <TXO[]>rootGetters['Transactions/TXOs']) {
            const e: ElysiumData = txo.elysium;
            if (!e || (txo.blockHeight && !e.valid) || txo.scriptType !== 'elysium' || !e.property || !e.amount) continue;

            const id = e.property.creationTx;
            r[id] = r[id] || {priv: 0, privUnconfirmed: 0, pub: {}};
            if (e.sender && txo.isFromMe && !r[id].pub[e.sender]) r[id].pub[e.sender] = 0;
            if (e.isToMe && !r[id].pub[e.receiver]) r[id].pub[e.receiver] = 0;

            if (e.type == "Lelantus Mint" && txo.isFromMe) {
                if (e.valid) r[id].priv += e.amount;
                else if (!txo.blockHeight) r[id].privUnconfirmed += e.amount;

                r[id].pub[e.sender] -= e.amount;
            } else if (e.type == "Simple Send") {
                if (txo.isFromMe && (e.valid || !txo.blockHeight)) r[id].pub[e.sender] -= e.amount;
                if (e.valid && e.isToMe) r[id].pub[e.receiver] += e.amount;
            } else if (e.type == "Lelantus JoinSplit") {
                if (txo.isFromMe && (e.valid || !txo.blockHeight)) r[id].priv -= e.amount;
                if (txo.isFromMe && !txo.blockHeight) {
                    if (e.joinmintAmount >= 0) {
                        r[id].priv -= e.joinmintAmount;
                        r[id].privUnconfirmed += e.joinmintAmount;
                    } else {
                        console.error(`Transaction ${txo.txid} has an erroneous joinmintAmount.`);
                    }
                }

                if (e.valid && e.isToMe) r[id].pub[e.receiver] += e.amount;
                else if (e.isToMe && !txo.blockHeight) r[id].privUnconfirmed += e.amount;
            } else if (e.type == "Create Property - Fixed") {
                if (txo.isFromMe && e.valid) r[id].pub[e.sender] += e.amount;
                // TODO: Change the names here, as the unconfirmed funds are not actually private. Still, it's how we
                //       want to treat them.
                else if (txo.isFromMe && !txo.blockHeight) r[id].privUnconfirmed += e.amount;
            } else if (e.type == "Grant Property Tokens") {
                if (e.isToMe && e.valid) r[id].pub[e.receiver] += e.amount;
            }
        }
        return r;
    },

    aggregatedBalances: (state, getters) => {
        const r = {};

        for (const [token, data] of Object.entries(<ElysiumBalances>getters.balances)) {
            r[token] = {
                priv: data.priv,
                pending: Object.values(data.pub).reduce((a, x) => a + x, 0) + data.privUnconfirmed
            };
        }

        return r;
    },

    tokensNeedingAnonymization: (state, getters) => {
        const r = [];
        for (const [token, data] of Object.entries(<ElysiumBalances>getters.balances)) {
            if (!getters.selectedTokens.includes(token)) continue;
            for (const [addr, pubValue] of Object.entries(data.pub)) {
                if (pubValue) r.push([token, addr]);
            }
        }
        return r;
    },

    allSelectedTokens: (state) => state.allSelectedTokens,
    hasModifiedSelectedTokens: (state) => state.hasModifiedSelectedTokens,
    selectedTokens: (state, getters, rootState, rootGetters) => getters.allSelectedTokens[rootGetters['ApiStatus/block1']] || [],
    selectedAndOwnedTokens: (state, getters) =>
        [...Object.keys(getters.aggregatedBalances), ...getters.selectedTokens].sort().reduce((a, x) => a[a.length-1] == x ? a : [...a, x], []),
    tokenData: (state) => state.tokenData
};

export default {
    namespaced: true,
    state,
    mutations,
    actions,
    getters
};
