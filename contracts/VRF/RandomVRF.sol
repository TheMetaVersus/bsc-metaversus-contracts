//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IRandomVRF.sol";

contract RandomVRF is IRandomVRF, Ownable, VRFConsumerBase {

    mapping(bytes32 => uint256) internal requestIdToRandomness;
    mapping(address => bool) public admins;
    bytes32 internal keyHash;
    uint256 internal fee;

    modifier onlyOwnerOrAdmin {
        require(_msgSender() == owner() || admins[_msgSender()], "Ownable: Only owner or admin can access !");
        _;
    }

    constructor(address _vrfCoordinator, address _linkToken, bytes32 _keyHash) VRFConsumerBase(_vrfCoordinator, _linkToken) {
        keyHash = _keyHash;
        fee = 5e15;
    }

    /**
     *  @notice Set keyhash and fee for request random
     *
     *  @dev   Only owner or admin can call this function.
     */
    function setKeyHashAndFee(uint256 _fee, bytes32 _keyHash) external onlyOwnerOrAdmin {
        fee = _fee;
        keyHash = _keyHash;
    }

    /**
     *  @notice Get a random number and returns a requestId
     *
     *  @dev   Only owner or admin can call this function.
     */
    function getRandomNumber() external override onlyOwnerOrAdmin returns(bytes32) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee);
    }

    /**
     *  @notice Callback function to handle after get a random number
     */
    function fulfillRandomness(bytes32 _requestId, uint256 _randomness) internal override {
        requestIdToRandomness[_requestId] = _randomness;
    }

    /**
     *  @notice Get a random number from a requestId
     *
     *  @dev   All caller can call this function.
     */
    function randomForRequestID(bytes32 _requestID) external override view returns(uint256) {
        require(isRequestIDFulfilled(_requestID), "Not fulfilled");
        return requestIdToRandomness[_requestID];
    }

    /**
     *  @notice Get a bool whether handled fullfilled request or not
     *
     *  @dev   All caller can call this function.
     */
    function isRequestIDFulfilled(bytes32 _requestID) public override view returns(bool) {
        return requestIdToRandomness[_requestID] != 0;
    }

     /**
     *  @notice Get a bool whether account is admin or not
     *
     *  @dev   All caller can call this function.
     */
    function isAdmin(address account) external view returns(bool) {
        return admins[account];
    }
    
     /**
     *  @notice Set a account to become an admin
     *
     *  @dev  Only Owner can call this function.
     */
    function setAdmin(address admin, bool allow) external onlyOwner {
        admins[admin] = allow;
    }
}