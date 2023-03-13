require("dotenv").config();

const config = {
  dev: process.env.NODE_ENV !== "production",
  port: process.env.PORT || 8080,
  publicIP: "161.35.197.18" 
};

module.exports = { config };