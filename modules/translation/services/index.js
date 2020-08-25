const {
  TRANSLATION_SERVICE_API_ROOT,
  TEXT_TO_SPEECH_SERVICE_API_ROOT,
} = process.env;

const translationService = require("@videowiki/services/translation")(
  TRANSLATION_SERVICE_API_ROOT
);
const textToSpeechService = require('@videowiki/services/textToSpeach')(TEXT_TO_SPEECH_SERVICE_API_ROOT)
module.exports = {
  translationService,
  textToSpeechService,
};

