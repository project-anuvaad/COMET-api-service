const TRANSLATION_AUDIO_DIRECTORY = 'translation/audios';
const BACKGROUND_MUSIC_DIRECTORY = 'audios/backgroundMusic'

const supportedTranscribeLangs = [
    {
        code: 'ar-AE',
        name: 'Arabic',
        nativeName: 'العربية',
    },
    {
        code: 'en-US',
        name: 'English',
        nativeName: 'English',
    },
    {
        code: 'zh-CN',
        name: 'Chinese',
        nativeName: '中文 (Zhōngwén), 汉语, 漢語'
    },
    {
        code: 'gd-GB',
        name: 'Scottish Gaelic',
        nativeName: 'Gàidhlig'
    },
    {
        code: 'id-ID',
        name: "Indonesian",
        nativeName: "Bahasa Indonesia"
    },
    {
        code: 'nl-NL',
        name: "Dutch",
        nativeName: "Nederlands, Vlaams"
    },
    {
        code: 'es-ES',
        name: "Spanish",
        nativeName: "español, castellano"
    },
    {
        code: 'pt-PT',
        name: "Portuguese",
        nativeName: "Português"
    },
    {
        code: 'ru-RU',
        name: "Russian",
        nativeName: "русский язык"
    },
    {
        code: 'it-IT',
        name: "Italian",
        nativeName: "Italiano"
    },
    {
        code: 'fr-FR',
        name: "French",
        nativeName: "français, langue française"
    },
    {
        code: 'de-DE',
        name: "German",
        nativeName: "Deutsch"
    },
    {
        code: 'ga-IE',
        name: "Irish",
        nativeName: "Gaeilge"
    },
    {
        code: 'af-ZA',
        name: "Afrikaans",
        nativeName: "Afrikaans"
    },
    {
        code: 'ko-KR',
        name: "Korean",
        nativeName: "한국어 (韓國語), 조선말 (朝鮮語)"
    },
    {
        code: 'de-CH',
        name: "German",
        nativeName: "Deutsch"
    },
    {
        code: 'hi-IN',
        name: "Hindi",
        nativeName: "हिन्दी, हिंदी"
    },
    {
        code: 'cy-GB',
        name: "Welsh",
        nativeName: "Cymraeg"
    },
    {
        code: 'ms-MY',
        name: "Malay",
        nativeName: "bahasa Melayu, بهاس ملايو‎"
    },
    {
        code: 'he-IL',
        name: "Hebrew (modern)",
        nativeName: "עברית"
    },
    {
        code: 'da-DK',
        name: "Danish",
        nativeName: "dansk"
    },
    {
        code: 'en-AU',
        name: "English",
        nativeName: "English"
    },
    {
        code: 'pt-BR',
        name: "Portuguese",
        nativeName: "Português"
    },
    {
        code: 'ja-JP',
        name: "Japanese",
        nativeName: "日本語 (にほんご／にっぽんご)",
    },
    {
        code: 'es-US',
        name: "Spanish",
        nativeName: "español, castellano"
    },
    {
        code: 'en-GB',
        name: "English",
        nativeName: "English"
    },
    {
        code: 'fr-CA',
        name: "French",
        nativeName: "français, langue française"
    },
];


module.exports = {
    supportedTranscribeLangs,
    TRANSLATION_AUDIO_DIRECTORY,
    BACKGROUND_MUSIC_DIRECTORY,
}