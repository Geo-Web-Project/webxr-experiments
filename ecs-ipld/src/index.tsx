import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { getIpfs, providers } from "ipfs-provider";
import * as IPFSCore from "ipfs-core";
import * as IPFSHttpClient from "ipfs-http-client";

const { httpClient, jsIpfs } = providers;
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const ipfsP = getIpfs({
  providers: [
    httpClient({
      loadHttpClientModule: () => IPFSHttpClient,
      apiAddress: "/ip4/127.0.0.1/tcp/5001",
    }),
    httpClient({
      loadHttpClientModule: () => IPFSHttpClient,
      apiAddress: "/ip4/127.0.0.1/tcp/45005",
    }),
    jsIpfs({
      loadJsIpfsModule: () => IPFSCore,
      options: {
        preload: {
          enabled: false,
        },
      },
    }),
  ],
});

ipfsP.then((ipfs: any) => {
  console.log("IPFS API is provided by: " + ipfs.provider);
  if (ipfs.provider === "httpClient") {
    console.log("HTTP API address: " + ipfs.apiAddress);
  }
});

root.render(
  <React.StrictMode>
    <App ipfsP={ipfsP} />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
