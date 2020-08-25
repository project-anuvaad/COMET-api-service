const controller = require("./controller");

const multer = require("multer");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname +
        "-" +
        Date.now() +
        "." +
        file.originalname.split(".").pop()
    );
  },
});
const upload = multer({ storage: storage });

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here
  router.post("/register", upload.any(), controller.registerUser);
  router.post("/login", controller.loginUser);
  router.post("/resetPassword", controller.resetPassword);

  router.post("/generateLoginToken", controller.generateLoginToken);
  router.post("/refreshToken", controller.refreshToken);
  router.post("/decodeToken", controller.decodeToken);

  router.post("/encryptPassword", controller.encryptPassword);

  return router;
};

module.exports = {
  mount,
};
