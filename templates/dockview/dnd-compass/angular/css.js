/**
 * SystemJS CSS loader plugin.
 * When a .css file is imported, this plugin injects a <link> tag into the document head.
 */
exports.fetch = function (load) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = load.address;
    document.head.appendChild(link);
    return '';
};
