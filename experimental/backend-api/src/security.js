const jwt = require('jsonwebtoken');

function signAccessToken(config, payload) {
    return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: config.accessTokenTtl });
}

function signRefreshToken(config, payload) {
    return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.refreshTokenTtl });
}

function verifyAccessToken(config, token) {
    return jwt.verify(token, config.jwtAccessSecret);
}

function verifyRefreshToken(config, token) {
    return jwt.verify(token, config.jwtRefreshSecret);
}

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
};
