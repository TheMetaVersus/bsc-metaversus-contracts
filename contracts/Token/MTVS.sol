// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IMTVS.sol";

/**
 *  @title  Dev Fungible token
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC20 for Operation. These tokens initially are minted
 *          by the only controllers and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial.
 */
contract MTVS is ERC20Upgradeable, ERC165Upgradeable, IMTVS {

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _treasury
    ) public initializer {
        __ERC20_init(_name, _symbol);

        require(_treasury != address(0), "Invalid address");
        require(_totalSupply > 0, "Invalid amount");

        _mint(_treasury, _totalSupply);
    }

    /**
     *  @notice Burn token
     *
     *  @dev   All caller can call this function.
     */
    function burn(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        _burn(_msgSender(), amount);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IMTVS).interfaceId || super.supportsInterface(interfaceId);
    }
}
