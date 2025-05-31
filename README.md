# Council of Forest

![Council of Forest](https://github.com/Nonhuman-Nonsense/council-of-forest/blob/main/client/public/council-of-forest-preview.webp?raw=true)

Welcome to the Council of Forest!

What would an ancient pine say about deforestation? How would fishes react to a hydropower plant? Can AI embody the wisdom of a river, a tree, or a reindeer herd?

Through AI, nonhuman entities—trees, fungi, rivers, and animals—gather to deliberate the fate of their shared home. Their voices are shaped by a mix of knowledge systems, including traditional and Indigenous worldviews, ecological science, and data. They are drawn from interviews and conversations with people living in and caring for the Vindelälven-Juhttátahkka biosphere reserve—reindeer herders, forest owners, rewilding organizations, pollinator experts, and cultural workers—each with a deep connection to the land.

Council of Forest functions as an forum where the forest’s inhabitants voice their needs and consider the impact of human activities like logging, rewilding, and climate shifts. Humans are invited to listen, ask questions, and reflect. Each session concludes with a collective statement and a policy recommendation made by the forest. An experiment in ecological thinking and speculative design—exploring how technology can mediate between humans and the more-than-human world.

What does it mean to act in the forest’s best interest? Whose knowledge counts? And what happens when we take nonhuman voices seriously?

## Visit Council of Forest

The project (the code in this repo) is live on [council-of-forest.com](https://council-of-forest.com)

## Who made this?

<a href="https://nonhuman-nonsense.com/"><img src="https://github.com/Nonhuman-Nonsense/council-of-forest/blob/main/client/public/logos/nonhuman_nonsense_logo.png?raw=true" style="filter: invert(0.7);" width="120" /></a>


The project is an initiative by art & design collective [Nonhuman Nonsense](https://nonhuman-nonsense.com/) developed in collaboration with [Biosphere area Vindelälven-Juhttátahkka](https://vindelalvenbiosfar.se/), [Gundega Strauberga](https://www.gundegastrauberga.com/), [Albin Karlsson](https://www.polymorf.se/) and others.

[@nonhuman-nonsense](http://instagram.com/nonhuman_nonsense)

Council of Forest is funded by Vinnova ([ref. nr. 2025-00344](https://www.vinnova.se/en/p/council-of-the-forest)) and is a continuation of the project [Council of Foods](https://github.com/Nonhuman-Nonsense/council-of-foods) which has received funding from the European Union’s [Horizon Europe research and innovation programme under grant agreement 101069990](https://cordis.europa.eu/project/id/101069990).

<a href="https://cordis.europa.eu/project/id/101069990"><img src="https://github.com/Nonhuman-Nonsense/council-of-forest/blob/main/client/public/logos/logo_vinnova.webp?raw=true" style="filter: invert(0.7);" width="200" /></a>


---

# Developer instructions

The app has two parts, the client and the server.

The client is built on React, and the server on Node.js. They communicate via a Socket.io websocket.

### Building

During development, to enable automatic reload on changes

```
cd client
npm i
npm start
```

simultaniously in another terminal instance

```
cd server
npm i
npm run dev
```

you should then have a localhost copy running on port 3000.


## Build docker image

```
docker build . -t nonhumannonsense/council-of-forest:latest
docker push nonhumannonsense/council-of-forest:latest
```

on Apple silicon, you might need to add `--platform linux/amd64` or similar to the build command

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
