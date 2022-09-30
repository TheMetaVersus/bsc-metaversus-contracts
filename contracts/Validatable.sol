// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

import "./interfaces/IAdmin.sol";

contract Validatable is ContextUpgradeable {
    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier whenNotPaused() {
        require(!admin.isPaused(), "Pausable: paused");
        _;
    }

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZeroAmount(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

    function __Validatable_init(IAdmin _admin) internal onlyInitializing {
        __Context_init();

        // TODO Validate
        admin = _admin;
    }
}
