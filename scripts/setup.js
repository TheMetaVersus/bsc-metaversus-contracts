const fs = require("fs");

async function main() {

    let data = {
        name: `Mysterious Box NFT`,
        description:
            "This is the NFT for open more options combatant in game",
        image: `ipfs://QmdiDm66aqwvdtCiTkZzdahpCJgS24WQjWKmeaZYcJTDbz`,
    };
    await fs.writeFileSync(`${0}.json`, JSON.stringify(data));

    data = {
        name: `Mysterious Box NFT`,
        description:
            "This is the NFT for open more options combatant in game",
        image: `ipfs://QmVGR7Nc3QiQWFAZSb398iSmgqYbodu6LSkiAFQg27wrx9`,
    };
    await fs.writeFileSync(`${1}.json`, JSON.stringify(data));

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
