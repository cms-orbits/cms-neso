# Changelog

## 0.3.1

- Support configuration override through environment variables and `.yml` files

## 0.3.0

- Update mongoDB collections used by `CMS SAO` to track entry/draft transactions

## 0.2.0

- Proccess up to 10 jobs concurrently (can be overriden).
- Change environment variable override prefix to `NESO_`

## 0.1.0

- Package as Docker image `jossemargt/cms-neso:0.1.0`
- Get configuration flags as environment variables
- Process Entries and Entry drafts enquiries (one by one, on purpose)