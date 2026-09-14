#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
c++ -std=c++17 -O2 -Wall -Wextra -pedantic ooh_engine.cpp -o ooh_engine
