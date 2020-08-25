const jwt = require("jsonwebtoken");
const DEFAULT_EXPIRE_TIME = "48h";
const SECRET_STRING = process.env.SECRET_STRING;
const sha256 = require("sha256");

const userDbHandler = require("../../dbHandlers/user");

class AuthService {
  encryptPassword(passwordText) {
    return new Promise((resolve, reject) => {
      return resolve(sha256(passwordText));
    });
  }

  generateLoginToken(userId, temp) {
    return new Promise((resolve, reject) => {
      userDbHandler
        .findById(userId)
        .then((user) => {
          jwt.sign(
            { email: user.email, _id: user._id },
            SECRET_STRING,
            { expiresIn: temp ? "1m" : DEFAULT_EXPIRE_TIME },
            (err, encoded) => {
              if (err) {
                return reject(err);
              }
              return resolve(encoded);
            }
          );
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  refreshToken(token) {
    return new Promise((resolve, reject) => {
      jwt.verify(token, process.env.SECRET_STRING, (err, user) => {
        if (err) {
          console.log("decodeApiToken - error ", err);
          return reject(new Error("Invalid token signature"));
        }
        console.log("user is", user);
        const { email, _id } = user;

        jwt.sign(
          { email, _id },
          SECRET_STRING,
          { expiresIn: DEFAULT_EXPIRE_TIME },
          (err, newToken) => {
            if (err) return reject(err);
            return resolve({ token: newToken, data: { email } });
          }
        );
      });
    });
  }

  decodeToken(token) {
    return new Promise((resolve, reject) => {
      jwt.verify(token, process.env.SECRET_STRING, (err, user) => {
        if (err) {
          console.log("decodeApiToken - error ", err);
          return reject(new Error("Invalid token signature"));
        }
        return resolve(user);
      });
    });
  }
}

module.exports = new AuthService();
