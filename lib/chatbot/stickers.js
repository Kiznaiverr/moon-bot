const stickers = {
  angry: [
    "https://i.pinimg.com/736x/b3/e3/e0/b3e3e0a2c5b49e3e517ba510120ef2ac.jpg",
    "https://i.pinimg.com/474x/67/2b/db/672bdb0ac780821dfcdb22dd0397b3aa.jpg",
    "https://i.pinimg.com/474x/5d/62/fe/5d62fede44c3fcef62108992545514c1.jpg",
  ],
  sad: [
    "https://i.pinimg.com/736x/2b/80/63/2b8063100813cbcc46665cecdf890db7.jpg",
    "https://i.pinimg.com/236x/ed/af/c2/edafc265496fcc61326df5d65e612258.jpg",
    "https://i.pinimg.com/736x/fe/32/57/fe325776d3bdd1174fa04644870657cb.jpg",
  ],
  happy: [
    "https://i.pinimg.com/474x/ab/14/73/ab1473616d7806d0611fd8a7a8b3ed73.jpg",
    "https://i.pinimg.com/736x/69/50/b0/6950b01085f619a398fd850b9e9823dd.jpg",
    "https://i.pinimg.com/236x/73/bc/bf/73bcbf5e2b3ba00c21d2757dd9077984.jpg",
  ],
  shocked: [
    "https://i.pinimg.com/736x/2f/58/17/2f581709d8cfd95806ce418e2b7afb49.jpg",
    "https://i.pinimg.com/736x/0b/f3/f6/0bf3f6449a30a07ef747c77f82e2df3c.jpg",
    "https://i.pinimg.com/736x/22/f3/ed/22f3edee2597b6bad9387a28a079f8f3.jpg",
  ],
  smug: [
    "https://i.pinimg.com/736x/21/af/2f/21af2f0b114b63da59f35273b3e6828d.jpg",
    "https://i.pinimg.com/736x/03/50/d7/0350d76e76b266baaba55e578e7e6d7d.jpg",
    "https://i.pinimg.com/736x/7c/51/a0/7c51a04fe4c4655d2b76c4dc79ccee43.jpg",
  ],
  sleepy: [
    "https://i.pinimg.com/736x/ae/ce/03/aece03e8cee5007e325834fc8fe094dd.jpg",
    "https://i.pinimg.com/736x/25/62/d2/2562d2399e81860ec1b4fd40494dde90.jpg",
    "https://i.pinimg.com/736x/fb/39/ed/fb39eda5ad266b2e3f1315f492e2f850.jpg",
  ],
  blush: [
    "https://i.pinimg.com/736x/2a/bf/d1/2abfd1b004ec2c7ffc5219dea8033c3e.jpg",
    "https://i.pinimg.com/736x/0d/da/d4/0ddad43ee4b59be80389b125ef78929a.jpg",
    "https://i.pinimg.com/736x/0f/2d/89/0f2d892ed3bdff3c23be6746feff15ea.jpg",
  ],
};

const getStickerUrl = (category) => {
  if (!category) return null;
  const list = stickers[category.toLowerCase()];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
};

module.exports = {
  stickers,
  getStickerUrl,
};
