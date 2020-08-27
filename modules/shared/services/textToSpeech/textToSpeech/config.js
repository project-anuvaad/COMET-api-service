module.exports = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET,
  googleProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  googleClientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, "\n"),
};
