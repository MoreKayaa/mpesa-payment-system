function createFooter() {
  const footer = document.createElement("footer");
  footer.className =
    "py-4 bg-gray-800 text-white text-center fixed bottom-0 w-full";

  const poweredBy = document.createElement("div");
  poweredBy.className = "container mx-auto";
  poweredBy.innerHTML = `
      <div class="flex items-center justify-center">
        <span class="text-lg font-bold">Powered by</span>
        <a href="https://ckmarcketing.com" target="_blank" class="ml-2 font-bold text-xl text-indigo-400 hover:text-indigo-300 transition">
          CK Marketing Ltd
        </a>
      </div>
    `;

  footer.appendChild(poweredBy);
  return footer;
}

// Use in your HTML files
document.body.appendChild(createFooter());
