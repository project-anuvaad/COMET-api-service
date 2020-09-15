const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const uuid = require("uuid").v4;
const Jimp = require("jimp");

module.exports = {
  detectText(filePath) {
    return new Promise((resolve, reject) => {
      const pngPath = path.join(__dirname, `png_image_${uuid()}.png`);
      const outputPath = path.join(__dirname, `tesseract_output_${uuid()}`);
      Jimp.read(filePath)
        .then((image) => {
          return image.writeAsync(pngPath);
        })
        .then(() => {
          exec(`tesseract ${pngPath} ${outputPath}`, (err) => {
            if (err) {
              reject(err);
            } else {
                const content = fs.readFileSync(`${outputPath}.txt`, 'utf-8')
                resolve(content);
            }
            fs.unlink(pngPath, () => {});
            fs.unlink(`${outputPath}.txt`, () => {});
          });
        })
        .catch(reject);
    });
  },
};