const fs = require("fs");
// const uuidV4 = require('uuid').v4
const AWS = require("aws-sdk");
const GCTextToSpeech = require("@google-cloud/text-to-speech");

const {
  accessKeyId,
  secretAccessKey,
  googleProjectId,
  googleClientEmail,
  googlePrivateKey,
} = require("./config");
const GCTTSClient = new GCTextToSpeech.TextToSpeechClient({
  projectId: googleProjectId,
  credentials: {
    client_email: googleClientEmail,
    private_key: googlePrivateKey,
  },
});

const Polly = new AWS.Polly({
  signatureVersion: "v4",
  region: "us-east-1",
  accessKeyId,
  secretAccessKey,
});

function validateGCPTTSConfig() {
  return new Promise((resolve, reject) => {
    GCTTSClient.getProjectId()
    .then((p) => {
      if (p === googleProjectId) return resolve();
      return reject(new Error('Invalid ID'));
    })
    .catch(reject)
  })
}

function validatePollyTTSConfig() {
  return new Promise((resolve, reject) => {
    Polly.listSpeechSynthesisTasks((err, data) => {
      if (err) return reject(err);
      return resolve();
    })
  }) 
}
const GOOGLE_VOICES = {
  male: {
    "en-US": "en-US-Wavenet-D",
  },
  female: {
    "en-US": "en-US-Wavenet-C",
  },
};

const LANG_VOICES = {
  "en-US": "Joanna",
  "hi-IN": "Aditi",
  "fr-CA": "Chantal",
  "es-US": "Penelope",
  arb: "Zeina",
  "ja-JP": "Mizuki",
};

const LANG_CODES = {
  en: "en-US",
  hi: "hi-IN",
  fr: "fr-CA",
  es: "es-US",
  ar: "ar-XA",
  in: "id-ID",
  ja: "ja-JP",

  bn: "bn-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  ta: "ta-IN",
  te: "te-IN",
};

// const AWS_LANGS = [
//   'hi-IN',
//   'fr-CA',
//   'es-US',
//   'arb',
//   'ja-JP',
// ];

// const GOOGLE_LANGS = [
//   'en-US',
//   'id-ID',
// ]

const GOOGLE_VOICES_IDS = {
  en: {
    female: ["en-US-Wavenet-C"],
    male: ["en-US-Wavenet-D"],
  },
  hi: {
    female: [
      "hi-IN-Wavenet-A",
      "hi-IN-Wavenet-D",
      "hi-IN-Standard-A",
      "hi-IN-Standard-D",
    ],
    male: [
      "hi-IN-Wavenet-B",
      "hi-IN-Wavenet-C",
      "hi-IN-Standard-B",
      "hi-IN-Standard-C",
    ],
  },
  bn: {
    female: ["bn-IN-Standard-A"],
    male: ["bn-IN-Standard-B"],
  },
  gu: {
    female: ["gu-IN-Standard-A"],
    male: ["gu-IN-Standard-B"],
  },
  kn: {
    female: ["kn-IN-Standard-A"],
    male: ["kn-IN-Standard-B"],
  },
  ml: {
    female: ["ml-IN-Standard-A"],
    male: ["ml-IN-Standard-B"],
  },
  ta: {
    female: ["ta-IN-Standard-A"],
    male: ["ta-IN-Standard-B"],
  },
  te: {
    female: ["te-IN-Standard-A"],
    male: ["te-IN-Standard-B"],
  },
  ar: {
    female: ["ar-XA-Wavenet-A", "ar-XA-Standard-A", "ar-XA-Standard-D"],
    male: [
      "ar-XA-Wavenet-B",
      "ar-XA-Wavenet-C",
      "ar-XA-Standard-B",
      "ar-XA-Standard-C",
    ],
  },
};

const AWS_VOICES_IDS = {
  en: {
    male: ["Matthew", "Justin", "Joey"],
    female: ["Joanna", "Ivy", "Kendra", "Kimberly", "Salli"],
  },
};

const textToSpeech = (
  {
    text,
    langCode,
    vendor,
    voiceId,
    outputFormat,
    audioSpeed = 1,
    gender = "male",
  },
  targetPath,
  callback = () => {}
) => {
  return new Promise((resolve, reject) => {
    const mappedLandCode = LANG_CODES[langCode];
    let generateAudioFunc;
    if (!voiceId) {
      if (vendor === "aws") {
        voiceId = LANG_VOICES[mappedLandCode];
      } else {
        voiceId = GOOGLE_VOICES[gender][mappedLandCode];
      }
    }

    if (vendor === "aws") {
      generateAudioFunc = generatePollyAudio;
    } else {
      generateAudioFunc = generateGoogleAudio;
    }
    generateAudioFunc(
      {
        text,
        langCode: mappedLandCode,
        gender,
        voiceId,
        audioSpeed,
        outputFormat,
      },
      (err, audio) => {
        if (err) {
          reject(err);
          return callback(err);
        }

        fs.writeFile(targetPath, audio.AudioStream, (err) => {
          if (err) {
            reject(err);
            return callback(err);
          }
          resolve(targetPath);
          return callback(null, targetPath);
        });
      }
    );
  });
};
// Generate audio from Polly and check if output is a Buffer
const generatePollyAudio = ({ text, langCode, voiceId, outputFormat }, cb) => {
  const params = {
    Text: text,
    OutputFormat: outputFormat,
    LanguageCode: langCode,
    VoiceId: voiceId,
  };

  Polly.synthesizeSpeech(params)
    .promise()
    .then((audio) => {
      if (audio.AudioStream instanceof Buffer) {
        cb(null, audio);
      } else {
        cb("Audiostream is not a buffer");
      }
    });
};

const generateGoogleAudio = (
  { text, langCode, voiceId, audioSpeed = 1, outputFormat },
  cb
) => {
  const request = {
    input: { ssml: textToSsml(text) },
    voice: {
      languageCode: langCode,
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: outputFormat.toUpperCase(),
      pitch: 0,
      speakingRate: audioSpeed,
    },
  };
  GCTTSClient.synthesizeSpeech(request).then((response) => {
    if (response && response.length > 0) {
      if (response[0].audioContent instanceof Buffer) {
        cb(null, { AudioStream: response[0].audioContent });
      } else {
        cb("Audiostream is not a buffer");
      }
    } else {
      return cb("Something went wrong synthetizing speech");
    }
  });
};

// generateGoogleAudio({ text: 'test text', langCode: 'en-US', gender: 'female'})

// const writeAudioStreamToS3 = (audioStream, filename, cb) => {
//   putObject(bucketName, filename, audioStream, 'audio/mp3').then((res) => {
//     if (!res.ETag) {
//       cb('Error')
//     } else {
//       cb(null)
//     }
//   })
// }

// const putObject = (bucket, key, body, ContentType) =>
//   s3.putObject({
//     Bucket: bucket,
//     Key: key,
//     Body: body,
//     ContentType,
//   }).promise()

// const deleteAudios = (keys, callback) => {
//   if (keys && keys.length > 0) {
//     var objects = [];
//     keys.forEach((key) => {
//       objects.push({ Key: key })
//     });

//     const params = {
//       Bucket: bucketName,
//       Delete: {
//         Objects: objects,
//         Quiet: false
//       }
//     };

//     s3.deleteObjects(params, (err, data) => {
//       return callback(err, data);
//     });
//   } else {
//     return callback('No keys specified!');
//   }
// }

/**
 * Generates SSML text from plaintext.
 *
 * Given an input filename, this function converts the contents of the input text file
 * into a String of tagged SSML text. This function formats the SSML String so that,
 * when synthesized, the synthetic audio will pause for two seconds between each line
 * of the text file. This function also handles special text characters which might
 * interfere with SSML commands.
 *
 * ARGS
 * inputfile: String name of plaintext file
 * RETURNS
 * a String of SSML text based on plaintext input
 *
 */
function textToSsml(rawLines) {
  // Replace special characters with HTML Ampersand Character Codes
  // These codes prevent the API from confusing text with SSML tags
  // For example, '<' --> '&lt;' and '&' --> '&amp;'
  let escapedLines = rawLines;
  escapedLines = escapedLines.replace(/&/g, "&amp;");
  escapedLines = escapedLines.replace(/"/g, "&quot;");
  escapedLines = escapedLines.replace(/</g, "&lt;");
  escapedLines = escapedLines.replace(/>/g, "&gt;");

  // Convert plaintext to SSML
  let expandedNewline = escapedLines;
  // .replace(/\./g, '<break time="0.5s" />')
  // parse {{pause:time}} and add pause accordingly
  // .replace(new RegExp('{{pause:([0-9]+(\.[0-9]+)?)}}', 'ig'), '<break time="$1" />')
  // parse {{pause:time}} and add pause accordingly
  const matches = expandedNewline.match(
    new RegExp("{{pause:([0-9]+)}}", "igm")
  );
  if (matches && matches.length > 0) {
    matches.forEach(() => {
      const singleRegex = new RegExp("{{pause:([0-9]+)}}", "im");
      const matchParts = expandedNewline.match(singleRegex);
      expandedNewline = expandedNewline.replace(
        singleRegex,
        `<break time="${parseInt(matchParts[1]) / 10}" />`
      );
    });
  }
  // add 0.5 seconds pause for each dot
  expandedNewline = expandedNewline.replace(
    /(\.\s)|(\s\.)/g,
    '<break time="0.5s" />'
  );

  const ssml = "<speak>" + expandedNewline + "</speak>";
  // Return the concatenated String of SSML
  return ssml;
}

module.exports = {
  textToSpeech,
  validateGCPTTSConfig,
  validatePollyTTSConfig,
  GOOGLE_VOICES_IDS,
  AWS_VOICES_IDS,
};
