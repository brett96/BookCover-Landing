/**
 * BookCover central analytics — embed on standalone demos and static sites.
 *
 * <script src="https://bookcover.cercalabs.com/analytics.js"
 *   data-product="member-demo"
 *   data-site="member"
 *   data-track-url="https://bookcover.cercalabs.com/api/track"></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var product = script.getAttribute("data-product") || "bookcover-landing";
  var site = script.getAttribute("data-site") || "landing";
  var trackUrl =
    script.getAttribute("data-track-url") ||
    "https://bookcover.cercalabs.com/api/track";

  var VID_KEY = "bc_visitor_id";
  var SID_KEY = "bc_session_id";

  function randomId() {
    return (
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function getVisitorId() {
    try {
      var id = localStorage.getItem(VID_KEY);
      if (!id) {
        id = randomId();
        localStorage.setItem(VID_KEY, id);
      }
      return id;
    } catch (e) {
      return "anon";
    }
  }

  function getSessionId() {
    try {
      var id = sessionStorage.getItem(SID_KEY);
      if (!id) {
        id = randomId();
        sessionStorage.setItem(SID_KEY, id);
      }
      return id;
    } catch (e) {
      return "anon";
    }
  }

  function send(payload) {
    var body = JSON.stringify(
      Object.assign(
        {
          product: product,
          site: site,
          visitorId: getVisitorId(),
          sessionId: getSessionId(),
          referrer: document.referrer || null,
        },
        payload
      )
    );
    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackUrl, new Blob([body], { type: "application/json" }));
    } else {
      fetch(trackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
    }
  }

  function track(eventType, properties) {
    send({
      eventType: eventType,
      path: location.pathname + location.search,
      properties: properties || {},
    });
  }

  window.bcTrack = track;

  track("page_view", {});
})();
