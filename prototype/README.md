# Prototype

To run the prototype, cd into the server folder and run

```
npm run proto
```

or for development

```
npm run protodev
```

## Building the docker image

Make sure to run the build command from the repo root folder, to correctly include files etc.

```
docker build -t nonhumannonsense/council-of-foods:proto -f prototype/Dockerfile .
docker push nonhumannonsense/council-of-foods:proto
```

on Apple silicon, you might need to add `--platform linux/amd64` or similar to the build command