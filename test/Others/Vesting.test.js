const { MAX_UINT256 } = require("@openzeppelin/test-helpers/src/constants");
const { add, subtract, multiply, divide } = require("js-big-decimal");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { skipTime, getCurrentTime, acceptable } = require("../utils");

const CLIFF = "2596000";
const LINEAR = "23328000";

describe("Vesting", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user2 = accounts[1];
        user3 = accounts[2];
        user4 = accounts[3];

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [owner.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            owner.address,
            "Vetaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
        ]);

        const Vesting = await ethers.getContractFactory("Vesting");
        vesting = await upgrades.deployProxy(Vesting, [owner.address, token.address]);

        // await token.addController(admin.address);
        await token.mint(owner.address, "100000000000000000000000000"); // mint 1,000,000,000 token

        await token.connect(owner).approve(vesting.address, MAX_UINT256.toString());
    });

    describe("Deployment", () => {
        it("Should assign the owner successfully", async function() {
            const _owner = await vesting.owner();
            expect(_owner).to.equal(owner.address, "owner is not correctly");
        });
    });

    describe("initiateVests", () => {
        it("Should catch error Vesting: Bad length", async () => {
            await expect(
                vesting.connect(owner).initiateVests([], ["100"], ["100"], "1", "100", CLIFF, LINEAR)
            ).to.be.revertedWith("Vesting: Bad length");
        });

        it("Should catch error Vesting: Mismatched inputs", async () => {
            await expect(
                vesting
                    .connect(owner)
                    .initiateVests([user2.address, user3.address], ["100"], ["100"], "10", "10", CLIFF, LINEAR)
            ).to.be.revertedWith("Vesting: Mismatched inputs");

            await expect(
                vesting
                    .connect(owner)
                    .initiateVests([user2.address], ["100", "100"], ["100"], "10", "100", CLIFF, LINEAR)
            ).to.be.revertedWith("Vesting: Mismatched inputs");

            await expect(
                vesting.connect(owner).initiateVests([user2.address], [], ["100"], "10", "100", CLIFF, LINEAR)
            ).to.be.revertedWith("Vesting: Mismatched inputs");

            await expect(
                vesting.connect(owner).initiateVests([user2.address], ["100"], [], "10", "100", CLIFF, LINEAR)
            ).to.be.revertedWith("Vesting: Mismatched inputs");
        });

        it("Should catch error Vesting: Bad totalAmount", async () => {
            await expect(
                vesting
                    .connect(owner)
                    .initiateVests(
                        [user2.address, user3.address],
                        ["100", "100"],
                        ["10", "10"],
                        "10",
                        "100",
                        CLIFF,
                        LINEAR
                    )
            ).to.be.revertedWith("Vesting: Bad totalAmount");

            await expect(
                vesting.connect(owner).initiateVests([user2.address], ["90"], ["10"], "9", "100", CLIFF, LINEAR)
            ).to.be.revertedWith("Vesting: Bad totalAmount");
        });

        it("Should initiateVests successfully", async () => {
            const balanceOwner_before = await token.balanceOf(owner.address);
            const balancevesting_before = await token.balanceOf(vesting.address);
            const balanceUser_before = await token.balanceOf(user2.address);

            const amount = 100000000000000000000;

            let transaction = await vesting
                .connect(owner)
                .initiateVests([user2.address], [amount.toString()], ["10"], "10", amount.toString(), CLIFF, LINEAR);
            let blockNumber = (await ethers.provider.getTransaction(transaction.hash)).blockNumber;

            const date = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

            const balanceOwner_after = await token.balanceOf(owner.address);
            const balancevesting_after = await token.balanceOf(vesting.address);
            const balanceUser_after = await token.balanceOf(user2.address);

            expect(balanceOwner_after.toString()).to.equal(
                subtract(balanceOwner_before, amount.toString()),
                "Invalid balance owner"
            );
            expect(subtract(balanceOwner_before, balanceOwner_after)).to.equal(
                add(
                    subtract(balancevesting_after, balancevesting_before),
                    subtract(balanceUser_after, balanceUser_before)
                ),
                "Invalid balance vesting"
            );
            const nonce = await vesting.getNonce(user2.address);
            const vestId = await vesting.getVestId(user2.address, nonce - 1);
            const vest = await vesting.getVest(vestId);

            expect(vest.owner).to.equal(user2.address, "Invalid vest owner");
            expect(vest.amount.toString()).to.equal(amount.toString(), "Invalid vest amount");

            expect(vest.start.toString()).to.equal(date.toString(), "Invalid vest start");

            // initial = amount * percentTGE / SCALE = 100000000000000000000 * 100000000000000000 / 1000000000000000000 = 10000000000000000000
            expect(vest.initial.toString()).to.equal("10", "Invalid vest initial");

            expect(vest.cliff.toString()).to.equal(CLIFF, "Invalid vest cliff");

            expect(vest.linear.toString()).to.equal(LINEAR, "Invalid vest linear");
        });
    });

    describe("getClaimable", () => {
        it("Check getClaimable", async () => {
            const amount = 100000000000000000000;
            await vesting
                .connect(owner)
                .initiateVests([user2.address], [amount.toString()], ["10"], "10", amount.toString(), CLIFF, LINEAR);
            // skip 3 months
            await skipTime(7776000);

            const nonce = await vesting.getNonce(user2.address);
            const vestId = await vesting.getVestId(user2.address, nonce - 1);
            const vest = await vesting.getVest(vestId);
            const subAmount = subtract(vest.amount, vest.initial);
            const addCliff = add(vest.start, vest.cliff);

            let date_after = await getCurrentTime();
            let amountAble = await vesting.getClaimable(user2.address, nonce - 1);

            let timePassed = subtract(date_after, addCliff);
            let tokenCliff = divide(multiply(timePassed, subAmount), vest.linear.toString(), 0);

            // ((date_after - (start + cliff)) * (amount - initial) / linear) + initial - claimed
            let amountAble_cal = subtract(add(tokenCliff, vest.initial.toString()), vest.claimed.toString());

            const epsilon = 1;

            expect(acceptable(amountAble_cal, amountAble.toString(), epsilon)).to.be.true;
            // skip 3 months
            await skipTime(7776000);

            date_after = (await hre.ethers.provider.getBlock("latest")).timestamp;
            amountAble = await vesting.getClaimable(user2.address, nonce - 1);

            timePassed = subtract(date_after, addCliff);
            tokenCliff = divide(multiply(timePassed, subAmount), vest.linear.toString(), 0);

            // ((date_after - (start + cliff)) * (amount - initial) / linear) + initial - claimed
            amountAble_cal = subtract(add(tokenCliff, vest.initial.toString()), vest.claimed.toString());

            expect(acceptable(amountAble_cal, amountAble.toString(), epsilon)).to.be.true;
            // // skip 4 months
            await skipTime(10372001);

            amountAble = await vesting.getClaimable(user2.address, nonce - 1);

            amountAble_cal = subtract(vest.amount, vest.claimed);

            expect(acceptable(amountAble_cal, amountAble.toString(), epsilon)).to.be.true;
        });
    });

    describe("claim", () => {
        beforeEach(async () => {
            const amount = 100000000000000000000;
            await vesting
                .connect(owner)
                .initiateVests([user2.address], [amount.toString()], ["10"], "10", amount.toString(), CLIFF, LINEAR);
        });

        it("Should catch error Vesting: No token to claim", async () => {
            await expect(vesting.connect(user2).claim(user2.address, 1)).to.be.revertedWith(
                "Vesting: No token to claim"
            );
        });

        it("Should claim successfully", async () => {
            // skip 3 months
            await skipTime(7776000);
            // cal claimable

            const balanceUser_before = await token.balanceOf(user2.address);
            const balancevesting_before = await token.balanceOf(vesting.address);

            const balanceUser_after = await token.balanceOf(user2.address);
            const balancevesting_after = await token.balanceOf(vesting.address);

            const nonce = await vesting.getNonce(user2.address);
            const vestId = await vesting.getVestId(user2.address, nonce - 1);
            const vest_1 = await vesting.getVest(vestId);
            await vesting.connect(user2).claim(user2.address, nonce - 1);
            expect(balanceUser_after.toString()).to.equal(
                add(balanceUser_before, vest_1.claimed),
                "Invalid balance user2 round 1"
            );
            expect(subtract(balanceUser_after, balanceUser_before)).to.equal(
                subtract(balancevesting_before, balancevesting_after),
                "Invalid balance vesting round 1"
            );

            // skip 7 months
            await skipTime(181440000);
            await vesting.connect(user2).claim(user2.address, nonce - 1);

            const balanceUser_after_2 = await token.balanceOf(user2.address);
            const balancevesting_after_2 = await token.balanceOf(vesting.address);

            const vest_2 = await vesting.getVest(vestId);
            expect(vest_2.claimed.toString()).to.equal(vest_2.amount.toString(), "Invalid amount user2 round 2");

            expect(balanceUser_after_2.toString()).to.equal(
                add(balanceUser_after, subtract(vest_2.claimed.toString(), vest_1.claimed.toString())),
                "Invalid balance user2 round 3"
            );
            expect(subtract(balanceUser_after_2, balanceUser_after)).to.equal(
                subtract(balancevesting_after, balancevesting_after_2),
                "Invalid balance vesting round 2"
            );
        });
    });

    describe("getVestType", () => {
        it("getVestType return true", async () => {
            const amount = 100000000000000000000;
            await vesting
                .connect(owner)
                .initiateVests([user2.address], [amount.toString()], ["10"], "10", amount.toString(), CLIFF, LINEAR);

            const nonce = await vesting.getNonce(user2.address);
            const vestId = await vesting.getVestId(user2.address, nonce - 1);
            expect(await vesting.getVestType(vestId)).to.equal("10");
        });
    });
});
