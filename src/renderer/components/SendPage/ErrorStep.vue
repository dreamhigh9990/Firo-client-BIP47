<template>
    <div class="info-popup error-step">
        <div class="title">Error</div>

        <div class="content">
            {{ error }}
        </div>

        <div class="buttons">
            <button class="solid-button recommended ok-button" @click="$emit('ok')">
                Ok
            </button>
        </div>
    </div>
</template>

<script>
export default {
    name: "SendStepError",

    props: {
        error: {
            type: String,
            required: true
        }
    }
}
</script>

<style scoped lang="scss">
@import "src/renderer/styles/info-popup";
</style>
