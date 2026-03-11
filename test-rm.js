/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");

async function test() {
  const ReactMarkdown = (await import("react-markdown")).default;
  const remarkGfm = (await import("remark-gfm")).default;

  const el = React.createElement(
    ReactMarkdown,
    { remarkPlugins: [remarkGfm] },
    "* **TopJobs**",
  );
  console.log(renderToStaticMarkup(el));
}
test();
