# Faire tourner les commandes dans un vrai extension host

Date : 2026-07-30

## Problème

La v1 et la v2 ont été livrées avec un noyau pur entièrement testé et des commandes qui
n'avaient jamais tourné. Les 62 tests Vitest couvrent les parseurs, le graphe et la
planification ; ils ne disent rien de ce qui se passe quand un utilisateur clique. Tout ce
qui touche à `vscode.window`, à `workspace.findFiles` et à l'écriture d'un réglage était
donc vérifié par lecture du code, pas par exécution.

## Approche

Trois exécutions dans un vrai VS Code, pilotées par `@vscode/test-cli`, sur une solution
synthétique de six projets (`tests/fixtures`). Le test tourne dans le même extension host
que l'extension, donc il partage l'unique instance du module `vscode` : remplacer
`vscode.window.showQuickPick` y intercepte le vrai appel que la commande effectue. C'est
ce qui permet de répondre à un sélecteur ou à une boîte de saisie sans humain, sans
introduire de couture artificielle dans le code de production.

| Configuration | Extension C# | Ce qu'elle couvre |
| --- | --- | --- |
| `integration` | absente | découverte, génération, validation, dégradation |
| `csharp` | installée | la valeur réellement écrite dans `dotnet.defaultSolution` |
| `multi-root` | installée | la branche du chemin absolu, sur deux racines |

La fixture porte les deux formats de solution, un `Contoso.sln` de six projets et un
`Contoso.slnx` de trois. Les jeux diffèrent exprès : le contenu du filtre produit prouve
alors laquelle des deux a été lue, ce qu'un jeu identique ne dirait pas. Les deux fichiers
sont relus par `dotnet sln list` pour garantir que la fixture n'est pas une fiction.

Le découpage n'est pas un luxe : `dotnet.defaultSolution` appartient à l'extension C#, et
VS Code refuse d'écrire un réglage qu'aucune extension installée ne déclare. Sans elle, la
forme du chemin écrit est inobservable ; avec elle, la dégradation gracieuse est
inobservable. Il faut les deux.

## Trois défauts, qu'aucune relecture n'avait vus

**L'écriture du réglage lève quand l'extension C# est absente.** VS Code répond
`Unable to write to Workspace Settings because dotnet.defaultSolution is not a registered
configuration`. Conséquence : `pin()` échouait avant que `switchScope` n'atteigne son
avertissement soigneusement rédigé, qui était donc mort. L'utilisateur recevait une erreur
de la couche réglages, qu'il n'a pas provoquée et sur laquelle il ne peut rien.

Correction cohérente avec le reste du dépôt, où aucun parseur ne lève vers l'utilisateur :
`pin()` et `clear()` renvoient un `ScopeOutcome` au lieu de lever. Les trois points qui
changent le périmètre passent désormais par `applyScope`, seul endroit qui formule le
message. Le `try`/`catch` autour de l'écriture reste comme filet pour les autres causes
possibles, un `settings.json` non inscriptible par exemple.

**Les libellés du sélecteur sont ambigus en multi-racines.** `Discovery` appelait
`asRelativePath(uri, false)`, donc deux racines contenant chacune un `Contoso.sln`
donnaient deux entrées identiques, sans moyen de choisir. Le nom du dossier n'est ajouté
que lorsqu'il y a plus d'une racine, pour ne pas alourdir le cas courant.

**`Clear Scope` annonçait un succès sans rien faire**, pour la même raison
d'enregistrement que le premier point.

## Faits établis, pas supposés

Vérifiés contre le SDK 10.0.200 sur macOS, sur une solution réellement produite par
`dotnet new sln`, pas sur un fichier écrit à la main :

- **Un `.slnf` peut pointer sur un `.slnx`.** Les filtres ont été conçus pour le `.sln`
  classique, donc la question se posait : générer un filtre depuis un `.slnx` aurait pu
  produire un fichier mort. `dotnet sln <filtre> list` n'y voit que les projets retenus et
  `dotnet build <filtre>` réussit ; le projet exclu n'est pas construit. Séparateurs avant
  ou arrière, indifférent, comme pour le `.sln`.
- **`dotnet new sln` produit bien du `.slnx` par défaut** en 10.0.200.
- **Les dossiers de solution d'un `.slnx` sont écrits à plat**, chacun portant son chemin
  complet dans `Name`, y compris pour une imbrication : `<Folder Name="/1 - Libs/" />`
  puis `<Folder Name="/1 - Libs/Common/">`. Le parseur ne parcourt que le premier niveau
  et le supposait ; c'est confirmé, aucun projet n'est perdu.
- `dotnet.restartServer` existe toujours, vérifié dans le manifeste de
  `ms-dotnettools.csharp` 2.140.9. L'assertion porte sur le manifeste et non sur
  `getCommands()`, car l'extension C# n'enregistre ses commandes qu'après avoir démarré un
  serveur de langage, ce qu'elle ne fait pas dans un host de test nu.
- En racine unique, la valeur écrite est bien relative au dossier (`Contoso.sln`) ; en
  multi-racines, elle est bien absolue. Le fait n°4 de la conception v1 tient.
- Un filtre nommant un projet absent de la solution est refusé avant tout épinglage, et
  l'utilisateur peut passer outre en connaissance de cause.

## Piège d'environnement

Le socket de contrôle du host de test vit dans `--user-data-dir`, et un socket Unix est
plafonné à 103 caractères. L'emplacement par défaut sous `.vscode-test/` dépasse ce
plafond dès que le dépôt est cloné quelques niveaux de dossiers en profondeur, et VS Code
échoue alors sur un `EINVAL` illisible. Le profil est donc placé dans le dossier
temporaire, sous un nom court.

## Ce que ces tests ne couvrent pas

Ils ne prouvent pas que le serveur de langage charge effectivement moins de projets, ni
qu'un redémarrage aboutit, ni que la barre d'état et les modales sont lisibles : la barre
d'état n'est pas interrogeable par l'API, et démarrer Roslyn sur une fixture jamais
restaurée n'apprendrait rien. Ce reste demande un œil humain sur une vraie solution, et
fait l'objet de [`docs/manual-check.md`](../manual-check.md).
