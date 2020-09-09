const process = global.process;
const express = require("express");
const morgan = require("morgan");
const methodOverride = require("method-override");
const compression = require("compression");
const mongoose = require("mongoose");

const app = express();
const server = require("http").Server(app);

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.API_DB_CONNECTION_URL)
  .then((con) => {
    con.connection.on("disconnected", () => {
      console.log("Database disconnected! shutting down service");
      process.exit(1);
    });
    const {
      DISABLE_PUBLIC_ORGANIZATIONS,
      SUPERUSER_EMAIL,
      SUPERUSER_PASSWORD,
      SUPERUSER_ORGANIZATION_NAME,
    } = process.env;
    if (
      DISABLE_PUBLIC_ORGANIZATIONS &&
      parseInt(DISABLE_PUBLIC_ORGANIZATIONS) === 1
    ) {
      const errors = [];
      if (!SUPERUSER_EMAIL) {
        errors.push("SUPERUSER_EMAIL is not properly set");
      }
      if (!SUPERUSER_PASSWORD) {
        errors.push("SUPERUSER_PASSWORD is not properly set");
      }
      if (!SUPERUSER_ORGANIZATION_NAME) {
        errors.push("SUPERUSER_ORGANIZATION_NAME is not properly set");
      }

      if (errors.length > 0) {
        console.log(
          "DISABLE_PUBLIC_ORGANIZATIONS is set to true but some required environment variables are not properly set"
        );
        console.log(errors);
        console.log("Exiting");
        return process.exit(1);
      }

      // Create user and organization
      const { User, Organization } = require("./modules/shared/models");
      const authService = require("./modules/shared/services/auth");
      let createdOrg;
      Organization.findOneAndUpdate(
        { name: SUPERUSER_ORGANIZATION_NAME },
        { $set: { name: SUPERUSER_ORGANIZATION_NAME } },
        { upsert: true, new: true }
      )
        .then((org) => {
          createdOrg = org.toObject();
          console.log("MAIN ORGANIZATION AVAILABLE");
          return authService.encryptPassword(SUPERUSER_PASSWORD);
        })
        .then((encryptedPassword) => {
          const userData = {
            email: SUPERUSER_EMAIL,
            password: encryptedPassword,
            passwordSet: true,
          };
          return User.findOneAndUpdate(
            { email: SUPERUSER_EMAIL },
            { $set: userData },
            { upsert: true, new: true }
          );
        })
        .then((user) => {
          console.log("SUPER USER AVAILABLE");
          if (
            !user.organizationRoles ||
            user.organizationRoles.length === 0 ||
            !user.organizationRoles.find(
              (role) =>
                role.organization.toString() === createdOrg._id.toString()
            )
          ) {
            const organzationRole = {
              organization: createdOrg._id,
              organizationOwner: true,
            };
            User.findByIdAndUpdate(user._id, {
              $addToSet: { organizationRoles: organzationRole },
            })
              .then(() => {
              })
              .catch((err) => {
                console.log("ERROR ADDING USER TO THE ORGANIZATION", err);
                process.exit(1);
              });
          }
        })
        .catch((err) => {
          console.log(err);
          process.exit(1);
        });
    }
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
require("./modules/shared/services/websockets/init")(server);

app.all("/*", (req, res, next) => {
  // CORS headers - Set custom headers for CORS
  res.header("Access-Control-Allow-Origin", "*"); // restrict it to the required domain
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS,PATCH"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-type,Accept,vw-x-whatsapp-bot-key,X-Access-Token, vw-x-user-api-key-secret, vw-x-user-api-key, X-Vw-Anonymous-Id, X-Key, Cache-Control, X-Requested-With"
  );
  if (req.method === "OPTIONS") {
    res.status(200).end();
  } else {
    next();
  }
});
app.use(morgan("dev")); // use morgan to log requests to the console

app.get("/", (req, res) => {
  return res.status(200).send("API BASE");
});

// app.use(bodyParser.json({ limit: '50mb' })) // parse application/json
// app.use(bodyParser.json({ type: 'application/vnd.api+json' })) // parse application/vnd.api+json as json
// app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' })) // parse application/x-www-form-urlencoded

app.use(methodOverride("X-HTTP-Method-Override")); // override with the X-HTTP-Method-Override header in the request. simulate DELETE/PUT
app.use(compression({ threshold: 0 }));

require("./router/index.js")(app); // pass our application into our routes

console.log(" API GATEWAY SERVICE ");
server.listen(PORT);
console.log(`Magic happens on port ${PORT}`); // shoutout to the user
console.log(`==== Running in ${process.env.NODE_ENV} mode ===`);
exports = module.exports = app; // expose app
// applyScriptMediaOnArticleOnAllArticles()
