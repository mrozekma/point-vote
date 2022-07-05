Point Vote is a web tool to hold realtime votes. The main purpose is for [planning poker](https://en.wikipedia.org/wiki/Planning_poker) sessions, but any kind of vote is possible. Currently a Jira Server application link is mandatory; this may change in the future. Note that this was designed for use on an isolated network; if you have an internet connection there are many free websites providing similar functionality.

# Setup

* Create an RSA keypair. For example, using OpenSSL:

    ```
    $ openssl genrsa -out jira_privatekey.pem 1024
    $ openssl req -newkey rsa:1024 -x509 -key jira_privatekey.pem -out jira_publickey.cer -days 365
    $ openssl pkcs8 -topk8 -nocrypt -in jira_privatekey.pem -out jira_privatekey.pcks8
    $ openssl x509 -pubkey -noout -in jira_publickey.cer  > jira_publickey.pem
    ```

* Generate a [random string](https://www.random.org/strings/?num=1&len=16&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new) to use as the consumer key.

* Create a Jira application link to give Point Vote access to Jira's API:

    (These steps were written using Jira 8.20; the process has streamlined a bit in newer versions of Jira).

    1. Under the `Jira Administration` menu, select `Applications`.
    1. Under `Integrations`, select `Application links`.
    1. Enter the URL you plan to host Point Vote at and select `Create new link`.
    1. Ignore the no response warning and select `Continue`.
    1. Fill out the form with the following values:

        | Field | Value |
        | --- | --- |
        | Application Name | Point Vote |
        | Application Type | Generic Application |
        | Service Provider Name | - |
        | Consumer key | The random value you generated earlier. |
        | Shared secret | - |
        | Request Token URL | - |
        | Access token URL | - |
        | Authorize URL | - |
        | Create incoming link | Yes |

    1. Select `Continue` and enter the following values:

        | Field | Value |
        | --- | --- |
        | Consumer Key | The random value you generated earlier. |
        | Consumer Name | Point Vote
        | Public Key | The `jira_publickey.pem` file you generated earlier.

    1. Select `Continue` to finish creating the link.

* Create the file `config.json` in the Point Vote root, containing the following:

    ```json
    {
        "server": {
            "url": "http://point-vote.example.com:3000", // The URL Point Vote will be hosted at.
            "websocketPort": 3001 // The port to use for websocket connections to the server. Currently this must be 3001.
        },
        "jira": {
            "url": "https://jira.example.com", // The URL Jira is hosted at.
            "consumerKey": "", // The random string you generated earlier.
            "privateKey": "jira_privatekey.pem", // The private RSA key you generated earlier.
            "storyPointsFieldName": "customfield_00000", // The name of the custom Jira Software field that holds story point values. This field is optional.
            "strictSSL": true // True to ignore SSL errors when connecting to Jira. This field is optional and defaults to false.
        }
    }
    ```

* Build Point Vote by running:

    ```sh
    $ yarn
    $ yarn build
    ```

* Start the server by running:

    ```sh
    $ node dist/server/server
    ```

    You may want to put this in a service that runs automatically on startup.

* The client webpage is at `dist/client` and can be hosted with any webserver, as long as it's configured to redirect 404s to `index.html`. For example, you can use [nginx](https://nginx.org/) by adding this to the `http` block of `/etc/nginx/nginx.conf`:

    ```nginx
    server {
        listen 3000;
        server_name _;
        root /path/to/point-vote/dist/client
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
    ```
