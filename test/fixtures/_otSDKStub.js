// Stand-in for the OneTrust SDK: it becomes ready late. Until then the banner's
// buttons do nothing, exactly like a pre-rendered OneTrust banner.
(function () {
  window.OnetrustActiveGroups = ',C0001,C0002,C0003,C0004,';
  setTimeout(function () {
    var style = document.createElement('style');
    style.id = 'onetrust-style';
    document.head.appendChild(style);
    var hide = function () { document.getElementById('onetrust-banner-sdk').style.display = 'none'; };
    document.getElementById('onetrust-reject-all-handler').addEventListener('click', function () {
      window.OnetrustActiveGroups = ',C0001,';
      CDT.report('rejected');
      hide();
    });
    document.getElementById('onetrust-accept-btn-handler').addEventListener('click', function () {
      CDT.report('accepted');
      hide();
    });
    document.getElementById('onetrust-pc-btn-handler').addEventListener('click', function () { CDT.report('settings'); });
    CDT.report('sdk-ready');
  }, 1200);
})();
