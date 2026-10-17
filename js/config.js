/*
 * Where the Dag API lives. This is the only file to edit when deploying.
 *
 *   api: 'https://dag-landtech-api.onrender.com'      Run the backend inside the browser, unless this page was
 *                    served by server/http.js (then it uses that server).
 *   api: 'browser'   Always run the backend inside the browser.
 *   api: 'https://dag-landtech-api.onrender.com'
 *                    Call the Render server. Use this on Vercel. While Render
 *                    wakes up, the page shows a wake screen; if the server
 *                    does not answer, it falls back to the in-browser backend.
 *
 * A visitor can override it for one visit with ?api=browser or ?api=<url>.
 */
window.DAG_CONFIG = {
  api: 'https://dag-landtech-api.onrender.com',
};
