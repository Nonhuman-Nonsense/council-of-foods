# Council of foods

Some talking fruits

## How to update the server:

```
docker build . -t nonhumannonsense/council-of-foods:latest
docker push nonhumannonsense/council-of-foods:latest
```

Then update the server, see server repo.

## Example docker prompt for running mongodb locally for development

```
docker run -d --name council-mongo -e MONGO_INITDB_ROOT_USERNAME=mongoadmin -e MONGO_INITDB_ROOT_PASSWORD=secret -p 27017:27017 mongo

```

## Converting transparent videos

https://rotato.app/tools/converter
