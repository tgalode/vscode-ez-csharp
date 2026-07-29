# Solution Scope — conception v1

Date : 2026-07-29

## Problème

Ouvrir un monolithe .NET de plusieurs dizaines de projets dans VS Code charge tout, à
chaque fois. Les filtres de solution `.slnf` résolvent ce problème depuis des années côté
MSBuild, et depuis le SDK 9.0.200 côté CLI `dotnet`, mais aucun outil d'édition n'aide à
les produire ni à les appliquer.

## Décisions de cadrage

| Décision | Choix | Raison |
| --- | --- | --- |
| Fondation langage | Dépendre de `ms-dotnettools.csharp` | Gratuite, sans restriction d'organisation, fournit déjà IntelliSense, navigation et debug. Seul C# Dev Kit est payant au-delà de 5 développeurs en usage commercial. |
| Périmètre | Filtres `.slnf` uniquement | L'arbre de solution et les commandes `dotnet` existent déjà dans `vscode-solution-explorer` (MIT, ~765 k installations). Réécrire cela n'apporte rien. |
| Écriture | Aucune mutation de `.sln` ni `.slnx` | Le risque de corrompre une solution est sans commune mesure avec le bénéfice, et le CLI `dotnet sln` couvre déjà ce besoin. |
| Lecture des formats | Parseurs TypeScript embarqués | Aucune dépendance à l'exécution, arbre instantané, fonctionne sans SDK installé, testable unitairement. Une couture (`solutionReader`) permet de basculer plus tard vers un binaire .NET utilisant `Microsoft.VisualStudio.SolutionPersistence`. |
| Diffusion | Marketplace et Open VSX, MIT | Le besoin n'est pas spécifique à un dépôt. |

## Faits vérifiés contre le SDK, non supposés

Ces quatre points ont été établis par l'expérience sur macOS avec le SDK 10.0.200. Trois
d'entre eux sont des pièges qu'une implémentation écrite de mémoire rate.

1. Un `.slnf` à séparateurs antislash fonctionne sur macOS, et le filtre est réellement
   honoré : un projet exclu n'est pas construit. Les slashs avant fonctionnent aussi.
2. `solution.path` est relatif au **fichier filtre**, mais chaque entrée de
   `solution.projects` est relative au répertoire de la **solution**. Un filtre placé dans
   un sous-dossier combine donc `../My.sln` et `src/A/A.csproj`.
3. Un filtre nommant un projet absent de la solution parente échoue en `MSB5028`. MSBuild
   ne l'ignore pas. La fermeture de dépendances doit donc être intersectée avec la
   solution avant écriture.
4. `dotnet.defaultSolution` accepte la valeur spéciale `disable`. En workspace
   multi-racines, une valeur enregistrée au niveau workspace n'est prise en compte que si
   elle est absolue ; en workspace simple, le relatif est résolu contre le dossier.

## Architecture

Le noyau n'importe jamais l'API VS Code, ce qui le rend testable sans hôte.

```
src/
  model/        parseurs .sln / .slnx / .slnf, graphe de ProjectReference
  filters/      planification, génération, validation
  workspace/    découverte, barre d'état, réglage du périmètre, journal, système de fichiers
  commands/     switchScope, generateFilter
```

Tout consommateur passe par `readSolution(uri)`, qui renvoie un `SolutionModel` aux chemins
normalisés. C'est le seul point à réimplémenter pour changer de stratégie de parsing.

## Choix de comportement issus de la confrontation au réel

Mesuré sur une solution réelle de 81 projets, dont le parseur retrouve exactement le même
décompte que `dotnet sln list`.

**Cible de la fermeture inverse.** La première version ajoutait les projets de test
atteignant n'importe quel élément de la fermeture de dépendances. Résultat mesuré : 29
projets de test ajoutés pour une seule application sélectionnée, parce que tous les tests
du dépôt atteignent le même socle partagé. Le filtre perdait sa raison d'être. La cible
retenue est l'ensemble des projets **explicitement sélectionnés** : 24 projets retenus et
1 seul projet de test, sur le même cas.

**Comparaison de chemins insensible à la casse.** Une solution et un fichier projet
divergent régulièrement sur la casse d'un répertoire partagé. Sur macOS et Windows ils
désignent le même fichier ; les traiter comme distincts perdrait silencieusement une
dépendance, ce qui est un échec plus grave que de confondre deux chemins ne différant que
par la casse.

**Détection des projets de test.** Signal principal : une référence à un paquet de
plateforme de test, ou `IsTestProject`. Repli sur le nom, pour les dépôts qui déclarent ces
paquets dans un `Directory.Build.props` partagé. Sur le dépôt de référence, les deux
signaux concordent exactement (26 projets).

**Permissivité du parseur XML.** `fast-xml-parser` accepte un élément non fermé sans
broncher, donc un `.slnx` malformé produirait un résultat partiel silencieux. Le contenu
est validé d'abord pour émettre un diagnostic, puis parsé au mieux.

## Gestion d'erreurs

Aucun parseur ne lève vers l'utilisateur : chacun renvoie ses diagnostics, journalisés dans
un canal de sortie dédié. Le graphe se protège des cycles par un ensemble de nœuds visités.
Si l'extension C# est absente, la génération continue de fonctionner et seule l'application
du périmètre est signalée comme sans effet.

## Tests

46 tests unitaires Vitest sur le noyau pur, avec un système de fichiers en mémoire. Les
fixtures sont synthétiques : une copie d'une solution d'entreprise exposerait sa structure
interne dans un dépôt public. La confrontation à une vraie solution se fait en local, hors
dépôt, par comparaison avec `dotnet sln list`.

## Hors périmètre v1

Arbre de solution, commandes build et run, explorateur de tests, mutation des fichiers de
solution. L'explorateur de tests natif fera l'objet d'une v2 : découverte via
`dotnet test --list-tests`, exécution ciblée par `--filter`, et débogage unitaire passant
par `VSTEST_HOST_DEBUG` puis attachement du débogueur de l'extension C#.
