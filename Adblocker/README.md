! ==============================================
! MYDEALZ FILTERLISTE (uBlock Origin Lite)
! Stand: 07.11.2025
! WICHTIG: Ersetze alle PLATZHALTER-Einträge (WORT_X, USER_X, etc.)
! ==============================================

! --- 1. FILTER NACH DEAL-TITEL (Themen-Spam) ---
! Zielt NUR auf den Titel ab (Klasse .thread-title--list).
mydealz.de##.threadListCard:has(.thread-title--list:has-text(/WORT_1|WORT_2|WORT_3|WORT_4|WORT_5|WORT_6|WORT_7|WORT_8|WORT_9|WORT_10/i))

! --- 2. FILTER NACH HÄNDLER ---
! Zielt NUR auf den Händlernamen-Link ab (a[data-t="merchantLink"]).
mydealz.de##.threadListCard:has(a[data-t="merchantLink"]:has-text(/HÄNDLER_1|HÄNDLER_2|HÄNDLER_3|HÄNDLER_4|HÄNDLER_5|HÄNDLER_6|HÄNDLER_7|HÄNDLER_8|HÄNDLER_9|HÄNDLER_10/i))

! --- 3. FILTER NACH BENUTZER (Poster) ---
! Zielt NUR auf den Usernamen ab (.thread-user).
mydealz.de##.threadListCard:has(.thread-user:has-text(/USER_1|USER_2|USER_3|USER_4|USER_5|USER_6|USER_7|USER_8|USER_9|USER_10/i))

! --- 4. FILTER NACH VOTE-STATUS ---
! Deals ausblenden, bei denen DU selbst kalt gevotet hast
mydealz.de##.vote-button--mode-down.vote-button--mode-selected:upward(.threadListCard)

! Deals ausblenden, bei denen DU selbst warm gevotet hast
mydealz.de##.vote-button--mode-up.vote-button--mode-selected:upward(.threadListCard)

! Deals ausblenden, die die eine Negative (-) Temperatur haben
mydealz.de##.threadListCard:has(.cept-vote-temp:has-text(/-\d+°/))

! --- 5. FILTER NACH ERSPARNIS-PROZENTSATZ ---
! Mindestens 20% Ersparnis anzeigen (Blendet Deals mit 1% bis 19% aus).
mydealz.de##.threadListCard:has(.textBadge:has-text(/-(1[0-9]|[1-9])%/i))

! --- 6. FILTER NACH TAUSENDER-PREIS (Über 1.000€) ---
! Blendet Deals aus, deren Preis einen Tausender-Punkt enthält (z.B. 1.299€).
mydealz.de##.threadListCard:has(.thread-price:has-text(/\./))

! --- 7. FILTER NACH PREISHÖHE (400€ bis 999€) ---
! Blendet Deals aus, deren Preis zwischen 400€ und 999€ liegt (ohne Komma).
mydealz.de##.threadListCard:has(.thread-price:has-text(/^[4-9]\d{2}€/))
