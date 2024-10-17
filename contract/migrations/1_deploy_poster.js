const Poster = artifacts.require("Poster");

module.exports = function (deployer) {
  deployer.deploy(Poster);
};