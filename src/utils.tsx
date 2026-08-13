export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function get_url_extension(url) {
    return url.split(/[#?]/)[0].split('.').pop().trim();
}

export function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}

export function b64_to_utf8(str) {
    return decodeURIComponent(escape(window.atob(str)));
}

// Used to prevent spamming the callback function
// will only call the last callback after no calls have
// been made for ms milliseconds. The preceeding callbacks
// will be ignored.
