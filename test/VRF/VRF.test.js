const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const LinkTokenInterface = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol/LinkTokenInterface.json");
const VRFConsumerBase = require("../../artifacts/@chainlink/contracts/src/v0.8/VRFConsumerBase.sol/VRFConsumerBase.json");
const { expect } = require("chai");
const { MockProvider } = require("@ethereum-waffle/provider");
const abi = new ethers.utils.AbiCoder();
describe("VRF chainlink:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        LINK = await deployMockContract(owner, LinkTokenInterface.abi);
        VRFConsumerBaseAddr = await deployMockContract(owner, VRFConsumerBase.abi);
        RandomVRF = await ethers.getContractFactory("RandomVRF");
        [vrfAddress, ...others] = new MockProvider().getWallets();
        randomVRF = await RandomVRF.deploy(vrfAddress.address, LINK.address, process.env.KEY_HASH);
    });

    describe("setKeyHashAndFee function", async () => {
        it("should revert when caller is not owner or admin", async () => {
            await expect(
                randomVRF
                    .connect(user1)
                    .setKeyHashAndFee(100, ethers.utils.formatBytes32String("1"))
            ).to.be.revertedWith("Ownable: only owner or admin can access !");
        });
        it("should set success", async () => {
            expect(await randomVRF.setKeyHashAndFee(100, ethers.utils.formatBytes32String("1")))
                .to.emit(randomVRF, "SetKeyHashAndFee")
                .withArgs(ethers.utils.formatBytes32String("1"), 100);
        });
    });

    describe("getRandomNumber function", async () => {
        it("should revert when caller is not owner or admin", async () => {
            await expect(randomVRF.connect(user1).getRandomNumber()).to.be.revertedWith(
                "Ownable: only owner or admin can access !"
            );
        });
        it("should revert when not enough LINK", async () => {
            await LINK.mock.balanceOf.returns(10);
            await expect(randomVRF.getRandomNumber()).to.be.revertedWith("ERROR: not enough LINK");
        });

        it("should random success", async () => {
            await LINK.mock.balanceOf.returns("1000000000000000000");
            await LINK.mock.transferAndCall.returns(true);
            const rqId = await randomVRF.getRandomNumber();

            let listener = await rqId.wait();
            let event = listener.events.find(x => x.event == "RequestId");

            const Id = event.args[0].toString();

            await randomVRF.connect(vrfAddress).rawFulfillRandomness(Id, 123, {
                gasLimit: 3000000,
            });

            // should return true
            let boolVal = await randomVRF.isRequestIDFulfilled(Id);

            expect(boolVal).to.equal(false);
        });
    });

    describe("randomForRequestID function", async () => {
        it("should revert when not fullfilled", async () => {
            await expect(
                randomVRF.randomForRequestID(ethers.utils.formatBytes32String("1"))
            ).to.be.revertedWith("ERROR: not fullfilled");
        });
    });

    describe("isRequestIDFulfilled function", async () => {
        it("should return bool value", async () => {
            expect(
                await randomVRF.isRequestIDFulfilled(ethers.utils.formatBytes32String("1"))
            ).to.equal(false);
        });
    });

    describe("setAdmin function", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(randomVRF.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("should set admin success: ", async () => {
            await randomVRF.setAdmin(user2.address, true);
            expect(await randomVRF.isAdmin(user2.address)).to.equal(true);

            await randomVRF.setAdmin(user1.address, false);
            expect(await randomVRF.isAdmin(user1.address)).to.equal(false);

            await randomVRF.setAdmin(user2.address, false);
            expect(await randomVRF.isAdmin(user2.address)).to.equal(false);
        });
    });
});
