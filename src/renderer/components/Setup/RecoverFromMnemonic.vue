<template>
    <div class="info-popup recover-from-mnemonic">
        <div class="title">
            Enter Your Recovery Mnemonic
        </div>

        <div class="content">
            <div class="mnemonic-length">
                <div class="mnemonic-length-question">
                    <span class="question">
                        Does your mnemonic have 12 or 24 words?
                    </span>

                    <span class="input">
                        <input type="radio" name="mnemonicLength" v-model="mnemonicLength" value="12" />
                        12
                    </span>

                    <span class="input">
                        <input type="radio" name="mnemonicLength" v-model="mnemonicLength" value="24" />
                        24
                    </span>
                </div>
            </div>

            <div class="mnemonic">
                <template v-for="(_, i) in newWords.length">
                    <input
                       ref="newWords"
                       :id="`mnemonic-word-${i}`"
                       :key="i"
                       :class="['mnemonic-word', 'hidden', isMnemonicValid ? 'verified' : 'unverified']"
                       type="text"
                       v-model="newWords[i]"
                       spellcheck="false"
                       :tabindex="i + 1"
                       @keydown="preventInvalidCharInput"
                       @keydown.enter="(ev) => onWhitespace(ev, i)"
                       @keydown.space="(ev) => onWhitespace(ev, i)"
                       @keydown.tab="(ev) => onWhitespace(ev, i)"
                       @beforeinput="(ev) => onWordInput(ev, i)"
                    />
                </template>
            </div>

            <div class="protective-passphrase">
                <div class="checkbox-field">
                    <input type="checkbox" v-model="hasProtectivePassphrase" id="hasProtectivePassphrase" />
                    <label class="question" for="hasProtectivePassphrase">
                        My wallet has a protective passphrase.
                    </label>
                </div>

                <div v-if="hasProtectivePassphrase" class="protective-passphrase-inputs">
                    <InputFrame label="Passphrase">
                        <input type="password" id="protectivePassphrase" v-model="protectivePassphrase" />
                    </InputFrame>

                    <InputFrame label="Confirm Passphrase">
                        <input type="password" id="confirmProtectivePassphrase" v-model="confirmProtectivePassphrase" />
                    </InputFrame>
                </div>
            </div>
        </div>

        <div class="buttons">
            <button id="back-button" class="solid-button unrecommended" @click="goBack">
                Go Back
            </button>

            <button id="ok-button" class="solid-button recommended" @click="submit" :disabled="!isVerified">
                OK
            </button>
        </div>
    </div>
</template>

<script>
import {validateMnemonic} from "daemon/firod";
import InputFrame from "renderer/components/shared/InputFrame";

export default {
    name: "RecoverFromMnemonic",

    components: {
        InputFrame
    },

    data() {
        return {
            mnemonicLength: 24,
            newWords: Array(24).fill(''),
            hasProtectivePassphrase: false,
            protectivePassphrase: '',
            confirmProtectivePassphrase: ''
        };
    },

    watch: {
        mnemonicLength() {
            if (this.mnemonicLength > this.newWords.length) {
                this.newWords = this.newWords.concat(Array(this.mnemonicLength - this.newWords.length).fill(''));
            } else if (this.mnemonicLength < this.newWords.length) {
                this.newWords = this.newWords.slice(0, this.mnemonicLength);
            }
        }
    },

    computed: {
        isVerified() {
            return this.isMnemonicValid && this.isProtectivePassphraseValid;
        },

        isMnemonicValid() {
            return this.newWords.length === Number(this.mnemonicLength) && validateMnemonic(this.newWords.join(' '));
        },

        isProtectivePassphraseValid() {
            return !this.hasProtectivePassphrase || (this.protectivePassphrase === this.confirmProtectivePassphrase);
        },

        mnemonic() {
            if (!this.isVerified) {
                return undefined;
            }

            return {
                mnemonic: this.newWords.join(' '),
                mnemonicPassphrase: this.hasProtectivePassphrase ? this.protectivePassphrase : null,
                isNewMnemonic: false
            };
        }
    },

    methods: {
        // Hooked to @keydown on newWords to prevent entering non-word characters.
        preventInvalidCharInput(event) {
            // Whitespace keys (e.g. Tab, Enter, etc.) result in key being a multicharacter string, which is NOT matched
            // here.
            if (event.key.match(/^[^a-z\s]$/) && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
            }
        },

        // Hooked to @beforeinput on newWords.
        //
        // Prevent pasting invalid invalid characters, and make multiple words pasted into a single field spread over
        // multiple fields. This also focuses the next element if the user enters a space.
        onWordInput(event, newWordIndex) {
            // This branch will be taken on e.g. backspace events
            if (!event.data) {
                return;
            }

            if (event.data.match(/[^a-z\s]/)) {
                // NOTE: We WILL be called on keyboard entry events, however Chrome uses an older version of the
                //       beforeinput spec where the event passed is NOT cancelable if it is from the keyboard, therefore
                //       the event.preventDefault() call will have no effect. Functionality to support that case is in
                //       the preventInvalidCharInput method.
                event.preventDefault();
                return;
            }

            const newWordEntrySplit = event.data.split(/\s+/);

            if (newWordEntrySplit.length <= 1) {
                return;
            }

            // If we reach this point, the user is pasting in multiple words.

            this.$set(this.newWords, newWordIndex, '');
            event.preventDefault();

            // If the user is pasting in a complete passphrase, pretend that we're in the first newWord so the user can
            // paste it in no matter which newWord they're actually in.
            if (newWordEntrySplit.length === this.newWords.length) {
                newWordIndex = 0;
            }

            let i = newWordIndex - 1;
            for (const word of newWordEntrySplit) {
                i++;

                this.$set(this.newWords, i, word);

                if (i >= this.$refs.newWords.length - 1) {
                    break;
                }
            }

            this.$refs.newWords[i].focus();
        },

        // If the user enters whitespace, move to the next word index.
        onWhitespace(event, newWordIndex) {
            event.preventDefault();

           if (newWordIndex < this.newWords.length - 1) {
                this.$refs.newWords[newWordIndex + 1].focus();
            }
        },

        goBack() {
            this.$router.back();
        },

        submit() {
            if (!this.isVerified) {
                return;
            }

            this.$router.push({
                path: '/setup/lock-wallet',
                query: {
                    mnemonic: this.mnemonic
                }
            })
        }
    }
};
</script>

<style lang="scss" scoped>
@import 'src/renderer/styles/mnemonic';

* {
    user-select: none !important;
}

.content {
    .mnemonic-length, .protective-passphrase {
        text-align: left;
    }

    .protective-passphrase {
        .protective-passphrase-inputs {
            margin-top: var(--padding-base);
            width: 500px;
        }
    }

    .mnemonic {
        @include mnemonic();
        margin: {
            top: var(--padding-base);
            bottom: var(--padding-base);
        }
    }
}
</style>
