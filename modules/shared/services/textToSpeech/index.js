const { generateTextToSpeech } = require("./textToSpeech");
class TextToSpeechService {
  convertTextToSpeech(
    {
      speakersProfile,
      speakerNumber,
      langCode,
      text,
      audioSpeed,
      outputFormat,
    },
    audioPath
  ) {
    return new Promise((resolve, reject) => {
      generateTextToSpeech({
        speakersProfile,
        speakerNumber,
        langCode,
        text,
        audioSpeed,
        outputFormat,
        audioPath,
      })
        .then(resolve)
        .catch(reject);
    });
  }
}

const textToSpeechService = new TextToSpeechService();

module.exports = require('@comet-anuvaad/vendors/textToSpeech') 