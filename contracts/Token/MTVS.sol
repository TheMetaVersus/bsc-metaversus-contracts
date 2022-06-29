// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 *  @title  Dev Fungible token
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC20 for Operation. These tokens initially are minted
 *          by the only controllers and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial.
 */
contract MTVS is Initializable, OwnableUpgradeable, ERC20Upgradeable {
    /**
     *  @notice controllers mapping from token ID to isComtroller status
     */
    mapping(address => bool) public controllers;

    modifier onlyControllers() {
        require(
            (owner() == _msgSender() || controllers[_msgSender()]),
            "Ownable: caller is not a controller"
        );
        _;
    }

    event SetController(address indexed user, bool allow);
    event Minted(address indexed receiver, uint256 indexed amount, uint256 timestamp);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _curator,
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _treasury
    ) public initializer {
        ERC20Upgradeable.__ERC20_init(_name, _symbol);
        OwnableUpgradeable.__Ownable_init();
        transferOwnership(_curator);
        controllers[_curator] = true;
        _mint(_treasury, _totalSupply);
    }

    /**
     *  @notice Check account whether it is the controller role.
     *
     *  @dev    All caller can call this function.
     */
    function isController(address account) external view returns (bool) {
        return controllers[account];
    }

    /**
     *  @notice Set or remove role controllers
     *
     *  @dev    Only owner can call this function.
     */
    function setController(address user, bool allow) external onlyOwner {
        controllers[user] = allow;
        emit SetController(user, allow);
    }

    /**
     *  @notice mint token
     *
     *  @dev    Only controllers can call this function.
     */
    function mint(address receiver, uint256 amount) external onlyControllers {
        require(receiver != address(0), "Error: Invalid address !");
        require(amount > 0, "Error: Amount equal to zero !");
        _mint(receiver, amount);

        emit Minted(receiver, amount, block.timestamp);
    }

    /**
     *  @notice burn token
     *
     *  @dev    Only controllers can call this function.
     */
    function burn(address from, uint256 amount) external onlyControllers {
        _burn(from, amount);
    }
}
