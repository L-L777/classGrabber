@echo off
nuitka --standalone --include-data-dir=templates=templates --include-data-dir=static=static --lto=yes --assume-yes-for-downloads app.py
