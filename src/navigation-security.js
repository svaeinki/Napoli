const EXTERNAL_URL_ALLOWLIST = Object.freeze([
    'dropbox.com'
]);

function esHttpSeguro(parsedUrl) {
    return parsedUrl.protocol === 'https:';
}

function hostnamePermitido(hostname, allowlist = EXTERNAL_URL_ALLOWLIST) {
    const hostNormalizado = String(hostname || '').toLowerCase();
    if (!hostNormalizado) {
        return false;
    }

    return allowlist.some((allowedHost) => {
        const allowed = String(allowedHost || '').toLowerCase();
        if (!allowed) {
            return false;
        }
        return hostNormalizado === allowed || hostNormalizado.endsWith(`.${allowed}`);
    });
}

function esUrlExternaPermitida(url, allowlist = EXTERNAL_URL_ALLOWLIST) {
    if (typeof url !== 'string' || !url.trim()) {
        return false;
    }

    try {
        const parsedUrl = new URL(url);
        return esHttpSeguro(parsedUrl) && hostnamePermitido(parsedUrl.hostname, allowlist);
    } catch (_) {
        return false;
    }
}

function esFileUrl(url) {
    return typeof url === 'string' && url.startsWith('file://');
}

module.exports = {
    EXTERNAL_URL_ALLOWLIST,
    esUrlExternaPermitida,
    esFileUrl,
    hostnamePermitido
};
