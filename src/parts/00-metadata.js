// ==UserScript==
// @name         mydealz Manager
// @namespace    http://tampermonkey.net/
// @version      1.19.0_260225_0001
// @description  Blendet unerwünschte Deals nach Händler, Wörtern, Preis und Temperatur aus, entfernt Händlernamen aus Titeln und bietet komfortable Listen zur Verwaltung von Filtern und blockierten Nutzern.
// @author       Flo (https://www.mydealz.de/profile/Basics0119) (https://github.com/9jS2PL5T) & Moritz Baumeister (https://www.mydealz.de/profile/BobBaumeister) (https://github.com/grapefruit89)
// @license      MIT
// @match        https://www.mydealz.de/*
// @match        https://www.preisjaeger.at/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mydealz.de
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

// @file src/parts/00-metadata.js
// @description Tampermonkey-Metadatenblock (wird unverändert in dist übernommen).

