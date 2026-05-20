#!/bin/bash

if [ -d package ]; then
    rm -rf package
    mkdir package
else
    mkdir package
fi

cp main.py package/main.py
cp requirements.txt package/requirements.txt
cp setup.py package/setup.py
cp -R app package/

if [ -f .env.dev ]; then
    cp .env.dev package/.env
fi