# Council of foods

![Council of Foods](https://github.com/Nonhuman-Nonsense/council-of-foods/blob/main/client/public/council-of-foods-preview.jpeg?raw=true)

Welcome to the Council of Foods!

A political arena for foods to discuss the broken food system. Here, you, as a human participant, can listen, engage, and contribute to the discussions. The foods are prompted on different knowledges and ethical guidelines using the AI Language model GPT from Open AI.

Our council members represent a diverse spectrum of food origins and ethical viewpoints, including mass-produced, locally grown, genetically modified, processed, fair trade, affordable, and organic foods. Each member brings their own unique eco-social impacts and ethical guidelines to the table, informed by their distinct backgrounds. Join the discussion on what actions need to be taken to form a locally and globally sustainable food system!

## Visit Council of Foods

The project (the code in this repo) is live on [council-of-foods.com](https://council-of-foods.com)

## Who made this?

<a href="https://nonhuman-nonsense.com/"><img src="https://github.com/Nonhuman-Nonsense/council-of-foods/blob/main/logo_nonhuman_nonsense.gif?raw=true" width="120" /></a>

The project is an initiative by art & design collective [Nonhuman Nonsense](https://nonhuman-nonsense.com/) developed in collaboration with [Studio Other Spaces](https://studiootherspaces.net/), [In4Art](https://www.in4art.eu/), [Elliot Cost](https://elliott.computer/), [Albin Karlsson](https://www.polymorf.se/) and others.

[@nonhuman-nonsense](http://instagram.com/nonhuman_nonsense)

Council of Foods is part of [The Hungry EcoCities project](https://starts.eu/hungryecocities/), part of the [S+T+ARTS](https://starts.eu/) programme, and has received funding from the European Union’s [Horizon Europe research and innovation programme under grant agreement 101069990](https://cordis.europa.eu/project/id/101069990).

<a href="https://cordis.europa.eu/project/id/101069990"><img src="https://github.com/Nonhuman-Nonsense/council-of-foods/blob/main/logos_eu-starts-black.webp?raw=true" width="500" /></a>


---

# Developer instructions

The app has three parts: the client, the server, and (for museum installs) the talk-button stack in [`button/`](button/).

The client is built on React, and the server on Node.js. They communicate via a Socket.io websocket.

See [Server Documentation](server/README.md) for detailed backend instructions and testing modes.

For physical museum / kiosk installs, see [MUSEUM.md](MUSEUM.md) (app mode, button bridge, staff setup).

For how the live client survives socket drops without lost input, deadlocks, or crashes — and
the pattern any new client-driven socket action should follow — see
[RESILIENCE.md](RESILIENCE.md).

### Building

During development, to enable automatic reload on changes

```
cd client
npm i
npm run dev
```

simultaniously in another terminal instance

```
cd server
npm i
npm run dev
```

you should then have the app at [http://localhost:5173](http://localhost:5173) (Vite), proxied to the server on port 3001.

Set `PORT` in `server/.env` to run multiple checkouts side by side (e.g. `PORT=3002` → server 3002, Vite 5174). Docker/production still use port 3001 unless overridden at deploy time.


## Build docker image

From the `server/` folder:

```
npm run docker              # latest
npm run docker -- test
npm run docker -- asilomar
npm run push -- asilomar
```

Flavors: `latest`, `test`, `proto`, `asilomar`, `logiqs`. On Apple Silicon, builds automatically target `linux/amd64`.

## Database example

The server uses MongoDB to store council meetings, this needs to be running locally for development.

Example docker prompt for running mongodb locally for development:

```
docker run -d --name council-mongo -e MONGO_INITDB_ROOT_USERNAME=mongoadmin -e MONGO_INITDB_ROOT_PASSWORD=secret -p 27017:27017 mongo
```

## Converting transparent videos

To convert transparent videos into web compatible formats, use this tool:

https://rotato.app/tools/converter

### Licence

This work is licensed under a
[Creative Commons Attribution-NonCommercial 4.0 International License][cc-by-nc]

[![CC BY-NC 4.0][cc-by-nc-image]][cc-by-nc]

[cc-by-nc]: https://creativecommons.org/licenses/by-nc/4.0/
[cc-by-nc-image]: https://licensebuttons.net/l/by-nc/4.0/88x31.png
[cc-by-nc-shield]: https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg
