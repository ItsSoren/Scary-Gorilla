# Scary Gorilla

Station Écho est un jeu d’horreur WebXR pour casque, PC et mobile, basé sur la locomotion et les commandes de [Gorilla Lab](https://github.com/ItsSoren/VR).

Prends une lampe ou une balise dans le refuge de départ. Récupère les cartouches de la Réception, de la Cryogénie et de l’Incubation, puis active le sas 04 au premier niveau. Le labo couvre **2 756,25 m²** de cases praticables, murs exclus. La balise détourne une patrouille en désignant la position où elle est posée. Les créatures restent à l’extérieur du refuge.

En Réception, la passerelle jaune s’ouvre au-dessus d’un rebord. Saute ou prends appui avec les mains pour y monter. La gaine bleue est assez basse pour obliger à s’accroupir. Les créatures passent par les couloirs et peuvent tenter de t’intercepter à la sortie.

Une capsule d’échantillon se trouve près du poste technique de chaque étage. Ramène-la au dépôt vert du refuge et utilise-la sur place pour la comptabiliser. Les échantillons sont facultatifs et partagés avec ton salon.

La troisième cartouche donne l’alerte. Les créatures se coordonnent et attaquent plus vite après avoir repéré une cible. Au premier niveau, reste huit secondes dans le cercle du sas 04 pour t’extraire. Si tu quittes le cercle ou es rattrapé, le compte à rebours repart de zéro.

Les créatures retiennent la dernière position entendue ou aperçue. Elles se transmettent la piste, se répartissent les angles et empruntent l’ascenseur pour rejoindre une chasse. Bélier grogne avant de charger, Voile siffle et Écorce produit des cliquetis courts. Les sons sont atténués par les murs. En mode intense, leur attaque déclenche un gros plan sanglant et un cri de proximité. Le mode atténué réduit le son et retire le sang.

## Jouer

- PC · ZQSD ou WASD, glisser pour regarder, Maj pour courir, Espace pour sauter, C pour s’accroupir, E pour saisir ou lâcher et F pour utiliser.
- Casque · Ouvre le jeu en HTTPS dans le navigateur du casque. Pousse sur les surfaces avec les mains ou utilise le stick gauche. Grip pour saisir, gâchette pour utiliser, stick droit pour tourner par crans.
- Ascenseur · Sur la plateforme, E ou grip pour monter, F ou gâchette pour descendre.
- Multijoueur · Sélectionne le même salon que tes amis avant de lancer. Les cartouches, les poses des joueurs et les monstres sont partagés. Chaque joueur manipule sa propre lampe et sa propre balise.

## Lancer et héberger

```sh
python -m http.server 8416
```

Ouvre `http://localhost:8416/` sur PC. Three.js est fourni dans `vendor/`. Le solo fonctionne sans téléchargement externe une fois les fichiers servis, avec des polices système si Google Fonts est inaccessible.

Pour GitHub Pages, publie le contenu de ce dossier à la racine de `main`, puis sélectionne **Settings → Pages → Deploy from a branch → main → /(root)**.

Les trois salons utilisent les variables TurboWarp `☁ ScaryPlayer0` à `☁ ScaryPlayer9`, sur trois identifiants de projet distincts. Le relais est nécessaire aux parties en ligne.

## Sources

La locomotion de Gorilla Lab s’appuie sur GorillaLocomotion d’Another-Axiom. Les licences de GorillaLocomotion et de Three.js sont dans `vendor/`. Les créatures, les plans du labo et les sons synthétisés ont été créés pour Scary Gorilla.
