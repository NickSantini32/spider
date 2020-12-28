var textElement;
/**
 * Copy the given text to the clipboard.
 * Based on https://www.w3schools.com/howto/howto_js_copy_clipboard.asp
 * @param {String} text 
 */
function copyToClipboard(text) {
    if (!textElement) {
        textElement = document.createElement("textarea");
        textElement.classList.add("clipboardcontent")
        document.body.appendChild(textElement);
    }
    textElement.value = text;
    textElement.select();
    textElement.setSelectionRange(0, text.length);
    
    document.execCommand("copy");
    console.log("Copied to clipbaord", text);
}

/**
 * Copy the text of the given element to clipboard 
 * @param {HTMLElement} element 
 */
function copyElementToClipboard(element) {
  if ("textarea" === element.type || "input" === element.type) {
    element.select();
    element.setSelectionRange(0, 99999);
    document.execCommand("copy");
  } else {
    copyTextToClipboard(jQuery(element).text());
  }
  jQuery(element).fadeOut(200).fadeIn(500);
}

jQuery(function () {
  jQuery(".copy-clipboard").click(function() {
    var target = jQuery(jQuery(this).attr("data-target"));
    copyElementToClipboard(target[0]);
  });
})