FROM node:10.21.0
WORKDIR /api-service

COPY . .
RUN npm install

RUN apt-get update -y 
RUN apt-get install -y tesseract-ocr
RUN apt-get install -y libtesseract-dev 

EXPOSE 4000
CMD [ "npm", "run", "docker:prod"]
HEALTHCHECK --start-period=30s --interval=2m CMD wget --quiet --tries=1 localhost:4000/health  -O /dev/null || exit 1
