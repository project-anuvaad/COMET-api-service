const path = require("path");
const uuid = require("uuid").v4;
const {
  textToSpeech,
  validateGCPTTSConfig,
  validatePollyTTSConfig,
  GOOGLE_VOICES_IDS,
  AWS_VOICES_IDS,
} = require("./TextToSpeechUtils");

function generateTextToSpeech({
  speakersProfile,
  text,
  langCode,
  speakerNumber,
  audioSpeed,
  outputFormat = "mp3",
  audioPath,
}) {
  return new Promise((resolve, reject) => {
    const speechMaps = getSpeakersProfileSpeechMapping(
      speakersProfile,
      langCode
    );
    const params = {
      text,
      langCode,
      outputFormat,
      audioSpeed,
    };
    const ttsInfo = speechMaps.find(
      (s) => parseInt(s.speaker.speakerNumber) === parseInt(speakerNumber)
    );
    if (ttsInfo) {
      params.vendor = ttsInfo.vendor;
      params.voiceId = ttsInfo.voiceId;
    }

    const targetPath = audioPath || path.join(__dirname, `tts_audio${uuid()}.mp3`);

    textToSpeech(params, targetPath)
      .then(() => {
        return resolve(targetPath);
      })
      .catch(reject);
  });
}

function getSpeakersProfileSpeechMapping(speakersProfile, langCode) {
  const googleVoicesIds = { ...GOOGLE_VOICES_IDS };
  const awsVoicesIds = { ...AWS_VOICES_IDS };
  const voiceIds = {
    google: googleVoicesIds,
    aws: awsVoicesIds,
  };
  if (!googleVoicesIds[langCode] && !awsVoicesIds[langCode])
    throw new Error("Unsupported langCode" + langCode);

  const speechMap = [];
  const lastIndexMap = {
    male: 0,
    female: 0,
  };
  const vendorsMap = {
    male: "google",
    female: "google",
  };

  speakersProfile.forEach((speaker) => {
    let { speakerGender } = speaker;
    speakerGender = speakerGender.toLowerCase();
    if (
      voiceIds[vendorsMap[speakerGender]][langCode][speakerGender][
        lastIndexMap[speakerGender]
      ]
    ) {
      speechMap.push({
        speaker,
        vendor: vendorsMap[speakerGender],
        voiceId:
          voiceIds[vendorsMap[speakerGender]][langCode][speakerGender][
            lastIndexMap[speakerGender]
          ],
      });
    } else {
      // switch vendors
      if (vendorsMap[speakerGender] === "google") {
        vendorsMap[speakerGender] = "aws";
      } else {
        vendorsMap[speakerGender] = "google";
      }
      lastIndexMap[speakerGender] = 0;
      // If the new vendor dont support the lang or gender, re-switch
      if (!voiceIds[vendorsMap[speakerGender]][langCode] || !voiceIds[vendorsMap[speakerGender]][langCode][speakerGender]) {
        if (vendorsMap[speakerGender] === "google") {
          vendorsMap[speakerGender] = "aws";
        } else {
          vendorsMap[speakerGender] = "google";
        }
      }
      speechMap.push({
        speaker,
        vendor: vendorsMap[speakerGender],
        voiceId:
          voiceIds[vendorsMap[speakerGender]][langCode][speakerGender][
            lastIndexMap[speakerGender]
          ],
      });
    }
    lastIndexMap[speakerGender]++;
  });
  return speechMap;
}

module.exports = {
  generateTextToSpeech,
  validateGCPTTSConfig,
  validatePollyTTSConfig,
};
